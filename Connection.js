import * as P from './PDU';
import { ReadStream as ReadStream } from './RWStream';
import { readMessage as readMessage } from './Message';

function time () {
  return Math.floor(Date.now() / 1000);
}

export default class Connection extends require("net").Socket {
  constructor(host, port, options) {
    this.host = host;
    this.port = port;
    this.options = Object.assign({
      hostAE : "", sourceAE : "OHIFDCM", maxPackageSize : 32768, idle : 60, reconnect : true
    }, options);

    this.connected = false;
    this.started = null;
    this.lastReceived = null;
    this.associated = false;
    this.receiving = null;
    this.receiveLength = null;
    this.minRecv = null;
    this.pendingPDVs = null;
    //this.retrieveModel = RETRIEVE_MODEL_STUDY_ROOT;
    this.presentationContexts = [];
    this.transferSyntaxes = [];
    this.negotiatedContexts = {};
    this.messages = {};
    this.messageIdCounter = 0;
    this.services = [];
    this.lastCommand = null;
    this.lastSent = null;
    this.lastGets = [];
    super();

    //register hooks
    this.on("connect", this.ready);
    this.on("data", this.received);
    this.on("close", this.closed);
    this.on("error", this.error);
    this.on("end", function(){
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }      
      //console.log('ended');
    })
    this.on("released", function() {
      this.end();
    });
    this.on('aborted', function(){
      this.end();
    })
    this.on('message', function(pdvs) {
      this.receivedMessage(pdvs);
    }); 

    //this.pause();
  }

  checkIdle() {
    let current = time(), idl = this.options.idle;
    if (!this.lastReceived && (current - this.started >= idl)) {
      this.idleClose();
    } else if (this.lastReceived && (current - this.lastReceived >= idl)) {
      this.idleClose();
    } else {
      //console.log('keep idling')
    }
  }

  idleClose() {
    console.log('Exceed idle time, closing connection');
    this.release();
  }

  getSoureceAE() {
    return this.options.sourceAE;
  }

  ready() {
    console.log("Connection established");
    this.connected = true;
    this.started = time();

    let o = this;
    this.intervalId = setInterval(function(){
      o.checkIdle();
    }, 3000);

    this.emit("init");
    //this.startAssociationRequest();
  }

  resetReceive() {
    this.receiving = this.receiveLength = null;
  }

  received(data) {
    let i = 0;
    do {//if(this.receiving === null && data.readUInt8(0) > 60) console.log('too big', data.readUInt8(0));
      data = this.process(data);
    } while (data !== null);
    this.lastReceived = time();
  }

  process(data) {
    //console.log("Data received");
    if (this.receiving === null) {
      /*if (this.minRecv) {this.options.maxPackageSize
        data = Buffer.concat([this.minRecv, data], this.minRecv.length + data.length);
        this.minRecv = null;
      }*/
      
      let stream = new ReadStream(data), type = stream.read(C.TYPE_UINT8);
      stream.increment(1); 
      let len = stream.read(C.TYPE_UINT32), cmp = data.length - 6;
      if (len > cmp) {
        this.receiving = data;
        this.receiveLength = len;
      } else {
        let process = data, remaining = null;
        if (len < cmp) {
          process = data.slice(0, len + 6);
          remaining = data.slice(len + 6, cmp + 6);
        }
        this.resetReceive();
        this.interpret(new ReadStream(process));
        if (remaining) {
          return remaining;
        }
      }
    } else {
      let newData = Buffer.concat([this.receiving, data], this.receiving.length + data.length), 
          pduLength = newData.length - 6;

      if (pduLength < this.receiveLength) {
        this.receiving = newData;
      } else {
        let remaining = null;
        if (pduLength > this.receiveLength) {
          remaining = newData.slice(this.receiveLength + 6, pduLength + 6);
          newData = newData.slice(0, this.receiveLength + 6);
        }
        this.resetReceive();
        this.interpret(new ReadStream(newData));
        if (remaining) {
          return remaining;
        }
      }
    }
    return null;
  }

  interpret(stream) {
    let pdatas = [], size = stream.size();
    while (stream.offset < size) {
      let pdu = P.pduByStream(stream);
      if (pdu.is(C.ITEM_TYPE_PDU_ASSOCIATE_AC)) {
        for (let ctx of pdu.presentationContextItems) {
          let requested = this.getContext(ctx.presentationContextID);
          if (!requested) {
            throw "Accepted presentation context not found";
          }
          this.negotiatedContexts[ctx.presentationContextID] = {
            id : ctx.presentationContextID, transferSyntax : ctx.transferSyntaxesItems[0].transferSyntaxName,
            abstractSyntax : requested.abstractSyntax
          };
          let notfound = false;
          for (let service of this.services) {
            if (service.contextUID == requested.abstractSyntax) {
              service.contextID = ctx.presentationContextID;
            }
          }
        }

        //console.log('Accepted');
        this.associated = true;
        this.emit('associated', pdu);
      } else if (pdu.is(C.ITEM_TYPE_PDU_RELEASE_RP)) {
        //console.log('Released');
        this.associated = false;
        this.emit('released');
      } else if (pdu.is(C.ITEM_TYPE_PDU_AABORT)) {
        //console.log('Aborted');
        this.emit('aborted');
      } else if (pdu.is(C.ITEM_TYPE_PDU_PDATA)) {
        pdatas.push(pdu);
      }
    }

    if (pdatas) {
      let pdvs = this.pendingPDVs ? this.pendingPDVs : [];
      for (let pdata of pdatas) {
        pdvs = pdvs.concat(pdata.presentationDataValueItems);
      }
      this.pendingPDVs = null;
      let i = 0, count = pdvs.length;
      while (i < count) {
        if (!pdvs[i].isLast) {
          let j = i + 1;
          while (j < count) {
            pdvs[i].messageStream.concat(pdvs[j].messageStream);
            if (pdvs[j++].isLast) {
              pdvs[i].isLast = true;
              break;
            }
          }
          if (pdvs[i].isLast) {
            this.emit('message', pdvs[i]);
          } else {
            this.pendingPDVs = [pdvs[i]];
          }
          i = j;
        } else {
          this.emit('message', pdvs[i++]);
        }
      } 
    }

    //this.release();
  }

  newMessageId() {
    return (++this.messageIdCounter) % 255;
  }

  closed(had_error) {
    this.connected = false;
    console.log("Connection closed", had_error);
    //this.destroy();
  }

  error(err) {
    console.log("Error: ", err);
  }

  connect(callback) {
    if (callback) {
      this.once("init", callback);
    }
    super.connect(this.port, this.host);
  }

  send(pdu) {
    //console.log('SEND PDU-TYPE: ', pdu.type);
    let toSend = pdu.buffer();
    //console.log('send buffer', toSend.toString('hex'));
    this.write(toSend, function(){
      //console.log('Data written');
    });
  }

  getSyntax(contextId) {
    if (!this.negotiatedContexts[contextId]) return null;

    return this.negotiatedContexts[contextId].transferSyntax;
  }

  getContextId(contextId) {
    if (!this.negotiatedContexts[contextId]) return null;

    return this.negotiatedContexts[contextId].id;
  }  

  getContext(id) {
    for (let ctx of this.presentationContexts) {
      if (id == ctx.id) return ctx;
    }
    return null;
  }

  setPresentationContexts(uids) {
    let contexts = [], id = 0;
    for (let uid of uids) {
      contexts.push({
        id : ++id,
        abstractSyntax : uid, 
        transferSyntaxes : [C.IMPLICIT_LITTLE_ENDIAN, C.EXPLICIT_LITTLE_ENDIAN, C.EXPLICIT_BIG_ENDIAN]
      });
    }
    this.presentationContexts = contexts;
  }

  verify() {
    this.setPresentationContexts([C.SOP_VERIFICATION]);
    this.startAssociationRequest(function(){
      //associated, we can release now
      this.release();
    });
  }

  release() {
    let releaseRQ = new P.ReleaseRQ();
    this.send(releaseRQ);    
  }

  addService(service) {
    service.setConnection(this);
    this.services.push(service);
  }

  receivedMessage(pdv) {
    let syntax = this.getSyntax(pdv.contextId), 
        msg = readMessage(pdv.messageStream, pdv.type, syntax);

    if (msg.isCommand()) {
      this.lastCommand = msg;

      if (msg.isResponse()) {
        if (msg.is(C.COMMAND_C_GET_RSP) || msg.is(C.COMMAND_C_MOVE_RSP)) {
          //console.log('remaining', msg.getNumOfRemainingSubOperations(), msg.getNumOfCompletedSubOperations());
        }
        if (msg.failure()) {
          //console.log("message failed with status ", msg.getStatus().toString(16));
        }
        if (msg.isFinal()) {
          let replyId = msg.respondedTo();
          if (this.messages[replyId].listener) {
            if (this.messages[replyId].listener[1]) {
              this.messages[replyId].listener[1].call(this, msg);
            }
            if (!msg.haveData())
              delete this.messages[replyId];
          }

          if (msg.is(C.COMMAND_C_GET_RSP)) {
            if (!msg.getNumOfRemainingSubOperations()) {
              if (this.lastGets && this.lastGets.length > 0) this.lastGets.shift(); 
            }
          }
        }
      } else {
        /*if (msg.is(0x01)) {
          console.log('ae title ', msg.getValue(0x00001031))
        }*/
      }

    } else {
      if (!this.lastCommand) {
        throw "Only dataset?";
      } else if (!this.lastCommand.haveData()) {
        throw "Last command didn't indicate presence of data";
      }

      if (this.lastCommand.isResponse()) {
        let replyId = this.lastCommand.respondedTo();
        if (this.messages[replyId].listener) {
          let args = [msg];
          if (this.lastCommand.failure()) {
            args.push(true);
          } else args.push(false);

          this.messages[replyId].listener[0].apply(this, args);

          if (this.lastCommand.failure()) {
            delete this.messages[replyId];
          }
        }
      } else {
        if (this.lastCommand.is(C.COMMAND_C_STORE_RQ)) {
          let moveMessageId = this.lastCommand.getMoveMessageId(), useId = moveMessageId;
          if (!moveMessageId) {
            //kinda hacky but we know this c-store is came from a c-get
            if (this.lastGets.length > 0) {
              useId = this.lastGets[0];
            } else {
              throw "Where does this c-store came from?";
            }            
          } else console.log('move ', moveMessageId);
          this.storeResponse(useId, msg);
        }
      }
    }
  }  

  storeResponse(messageId, msg) {
    let rq = this.messages[messageId];

    if (rq.listener[2]) {
      let status = rq.listener[2].call(this, msg);
      if (status !== undefined && status !== null && rq.command.store) {
        //store ok, ready to send c-store-rsp
        let storeSr = rq.command.store, replyMessage = storeSr.replyWith(status);
        replyMessage.setAffectedSOPInstanceUID(this.lastCommand.getSOPInstanceUID());
        replyMessage.setReplyMessageId(this.lastCommand.messageId);
        this.sendMessage(replyMessage, null, null, storeSr);                  
      } else {
        throw "Missing store status";
      }
    }
  }

  sendMessage(command, dataset, listener, service) {
    let syntax = this.getSyntax(service.contextID), 
        cid = service.contextID,
        messageId = this.newMessageId(), msgData = {};

    if (listener) {
      if (typeof listener != 'object') {
        listener = [listener, null];
      }
      msgData.listener = listener;
    }

    let pdata = new P.PDataTF(), 
        pdv = new P.PresentationDataValueItem(cid);

    command.setSyntax(C.IMPLICIT_LITTLE_ENDIAN);
    command.setContextId(service.contextUID);
    command.setMessageId(messageId);
    if (dataset)
      command.setDataSetPresent(C.DATA_SET_PRESENT);

    this.lastSent = command;
    if (command.is(C.COMMAND_C_GET_RQ)) {
      this.lastGets.push(messageId);
    }
    pdv.setMessage(command);
    pdata.setPresentationDataValueItems([pdv]);

    msgData.command = command;
    this.messages[messageId] = msgData;

    this.send(pdata);
    if (dataset) {
      dataset.setSyntax(syntax);
      let dsData = new P.PDataTF(), dPdv = new P.PresentationDataValueItem(cid);

      dPdv.setMessage(dataset);
      dsData.setPresentationDataValueItems([dPdv]);
      this.send(dsData);      
    }
  }  

  startAssociationRequest(callback) {
    if (callback) {
      this.once('associated', callback);
    }
    if (this.associated) {
      this.emit('associated');
      return;
    }

    if (this.services) {
      let contexts = [];
      for (let service of this.services) {
        contexts.push(service.contextUID);
      }
      this.setPresentationContexts(contexts);
    } else {
      throw "No services attached";
    }

    let associateRQ = new P.AssociateRQ();
    associateRQ.setCalledAETitle(this.options.hostAE);
    associateRQ.setCallingAETitle(this.options.sourceAE);
    associateRQ.setApplicationContextItem(new P.ApplicationContextItem());

    let contextItems = []
    for (let context of this.presentationContexts) {
      let contextItem = new P.PresentationContextItem(), syntaxes = [];
      for (let transferSyntax of context.transferSyntaxes) {
        let transfer = new P.TransferSyntaxItem();
        transfer.setTransferSyntaxName(transferSyntax);
        syntaxes.push(transfer);
      }
      contextItem.setTransferSyntaxesItems(syntaxes);
      contextItem.setPresentationContextID(context.id);

      let abstractItem = new P.AbstractSyntaxItem();
      abstractItem.setAbstractSyntaxName(context.abstractSyntax);
      contextItem.setAbstractSyntaxItem(abstractItem);
      contextItems.push(contextItem);
    }
    associateRQ.setPresentationContextItems(contextItems);

    let maxLengthItem = new P.MaximumLengthItem(),
        classUIDItem  = new P.ImplementationClassUIDItem(),
        versionItem   = new P.ImplementationVersionNameItem();

    classUIDItem.setImplementationClassUID(C.IMPLEM_UID);
    versionItem.setImplementationVersionName(C.IMPLEM_VERSION);
    maxLengthItem.setMaximumLengthReceived(this.options.maxPackageSize);

    let userInfo = new P.UserInformationItem();
    userInfo.setUserDataItems([maxLengthItem, classUIDItem, versionItem]);

    associateRQ.setUserInformationItem(userInfo);
    
    this.send(associateRQ);
  }

  setTransferSyntaxes(syntaxes) {
    this.transferSyntaxes = syntaxes;
  }
}