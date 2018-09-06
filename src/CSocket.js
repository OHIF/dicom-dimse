import util from 'util';
import { EventEmitter } from 'events';
import C from './constants.js';
import {
  PDU,
  AssociateRQ,
  ReleaseRQ,
  PDataTF,
  ApplicationContextItem,
  PresentationContextItem,
  PresentationDataValueItem,
  AbstractSyntaxItem,
  TransferSyntaxItem,
  UserInformationItem,
  ImplementationClassUIDItem,
  ImplementationVersionNameItem,
  MaximumLengthItem
} from './PDU.js';
import { ReadStream } from './RWStream.js';
import {
  DataSetMessage,
  DicomMessage,
  CCancelRQ,
  CFindRQ,
  CMoveRQ,
  CStoreRQ } from './Message.js';

const time = () => Math.floor(Date.now() / 1000);

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;

const Envelope = (command, dataset) => {
  EventEmitter.call(this);
  this.command = command;
  this.dataset = dataset;
};

util.inherits(Envelope, EventEmitter);

const CSocket = (socket, options) => {
  EventEmitter.call(this);
  this.socket = socket;
  this.negotiatedContexts = {};
  this.receiving = null;
  this.receiveLength = null;
  this.minRecv = null;
  this.lastReceived = null;
  this.presentationContexts = [];
  this.associated = false;
  this.pendingPDVs = null;
  this.connected = false;
  this.started = null;
  this.intervalId = null;
  this.lastCommand = null;
  this.lastSent = null;
  this.messages = {};
  this.messageIdCounter = 0;
  this.callingAe = null;
  this.calledAe = null;
  this.id = getRandomInt(1000, 9999);
  this.options = options;

  this.socket.on('connect', () => {
    console.info('Connect');
    this.ready();
  });

  this.socket.on('data', (data) => {
    this.received(data);
  });

  this.socket.on('error', (socketError) => {
    console.error('There was an error with DIMSE connection socket.');
    console.error(socketError.stack);
    console.trace();

    this.emit('error', new Error('server-internal-error', socketError.message));
  });

  this.socket.on('timeout', (socketError) => {
    console.error('The connection timed out. The server is not responding.');
    console.error(socketError.stack);
    console.trace();

    this.emit('error', new Error('server-connection-error', socketError.message));
  });

  this.socket.on('close', () => {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.connected = false;
    console.info('Connection closed');
    this.emit('close');
  });

  this.on('released', () => {
    this.released();
  });

  this.on('aborted', (pdu) => {
    console.warn(`Association aborted with reason ${pdu.reason}`);
    this.released();
  });

  this.on('message', (pdvs) => {
    this.receivedMessage(pdvs);
  });
};

util.inherits(CSocket, EventEmitter);

CSocket.prototype.setCallingAE = (ae) => {
  this.callingAe = ae;
};

CSocket.prototype.setCalledAe = (ae) => {
  this.calledAe = ae;
};

CSocket.prototype.associate = () => {
  const associateRQ = new AssociateRQ();

  associateRQ.setCalledAETitle(this.calledAe);
  associateRQ.setCallingAETitle(this.callingAe);
  associateRQ.setApplicationContextItem(new ApplicationContextItem());

  const contextItems = [];

  this.presentationContexts.forEach((context) => {
    const contextItem = new PresentationContextItem();
    const syntaxes = [];

    context.transferSyntaxes.forEach((transferSyntax) => {
      const transfer = new TransferSyntaxItem();

      transfer.setTransferSyntaxName(transferSyntax);
      syntaxes.push(transfer);
    });
    contextItem.setTransferSyntaxesItems(syntaxes);
    contextItem.setPresentationContextID(context.id);

    const abstractItem = new AbstractSyntaxItem();

    abstractItem.setAbstractSyntaxName(context.abstractSyntax);
    contextItem.setAbstractSyntaxItem(abstractItem);
    contextItems.push(contextItem);
  });
  associateRQ.setPresentationContextItems(contextItems);

  const maxLengthItem = new MaximumLengthItem();
  const classUIDItem = new ImplementationClassUIDItem();
  const versionItem = new ImplementationVersionNameItem();

  classUIDItem.setImplementationClassUID(C.IMPLEM_UID);
  versionItem.setImplementationVersionName(C.IMPLEM_VERSION);
  const packageSize = this.options.maxPackageSize ? this.options.maxPackageSize : C.DEFAULT_MAX_PACKAGE_SIZE;

  maxLengthItem.setMaximumLengthReceived(packageSize);

  const userInfo = new UserInformationItem();

  userInfo.setUserDataItems([maxLengthItem, classUIDItem, versionItem]);

  associateRQ.setUserInformationItem(userInfo);

  this.send(associateRQ);
};

CSocket.prototype.getContext = (id) => {
  for (const index in this.presentationContexts) {
    const context = this.presentationContexts[index];

    if (id === context.id) {
      return context;
    }
  }

  return null;
};

CSocket.prototype.getSyntax = (contextId) => {
  if (!this.negotiatedContexts[contextId]) {
    return null;
  }

  return this.negotiatedContexts[contextId].transferSyntax;
};

CSocket.prototype.getContextByUID = (uid) => {
  for (const index in this.negotiatedContexts) {
    const context = this.negotiatedContexts[index];

    if (context.abstractSyntax === uid) {
      return context;
    }
  }

  return null;
};

CSocket.prototype.getContextId = (contextId) => {
  if (!this.negotiatedContexts[contextId]) {
    return null;
  }

  return this.negotiatedContexts[contextId].id;
};

CSocket.prototype.setPresentationContexts = (uids) => {
  const contexts = [];
  let id = 0;

  uids.forEach((uid) => {
    id++;
    if (typeof uid === 'string') {
      contexts.push({
        id,
        abstractSyntax: uid,
        transferSyntaxes: [C.IMPLICIT_LITTLE_ENDIAN, C.EXPLICIT_LITTLE_ENDIAN, C.EXPLICIT_BIG_ENDIAN]
      });
    } else {
      contexts.push({
        id,
        abstractSyntax: uid.context,
        transferSyntaxes: uid.syntaxes
      });
    }
  });
  this.presentationContexts = contexts;
};

CSocket.prototype.newMessageId = () => (++this.messageIdCounter) % 65536;

CSocket.prototype.resetReceive = () => {
  this.receiving = this.receiveLength = null;
};

CSocket.prototype.send = (pdu, afterCbk) => {
  // Console.log('SEND PDU-TYPE: ', pdu.type);
  const toSend = pdu.buffer();
  // Console.log('send buffer', toSend.toString('hex'));

  return this.socket.write(toSend, afterCbk ? afterCbk : null);
};

CSocket.prototype.release = () => {
  const releaseRQ = new ReleaseRQ();

  this.send(releaseRQ);
};

CSocket.prototype.released = () => {
  this.socket.end();
};

CSocket.prototype.ready = () => {
  console.info('Connection established');
  this.connected = true;
  this.started = time();

  if (this.options.idle) {
    this.intervalId = setInterval(() => {
      this.checkIdle();
    }, 3000);
  }
};

CSocket.prototype.checkIdle = () => {
  const current = time();
  const idl = this.options.idle;

  if (!this.lastReceived && (current - this.started >= idl)) {
    this.idleClose();
  } else if (this.lastReceived && (current - this.lastReceived >= idl)) {
    this.idleClose();
  }
};

CSocket.prototype.idleClose = () => {
  console.info('Exceed idle time, closing connection');
  this.release();
};

CSocket.prototype.received = (data) => {
  do {
    data = this.process(data);
  } while (data !== null);
  this.lastReceived = time();
};

CSocket.prototype.process = (data) => {
  if (this.receiving === null) {
    if (this.minRecv) {
      data = Buffer.concat([this.minRecv, data], this.minRecv.length + data.length);
      this.minRecv = null;
    }

    if (data.length < 6) {
      this.minRecv = data;

      return null;
    }

    const stream = new ReadStream(data);

    stream.increment(1);
    const len = stream.read(C.TYPE_UINT32);
    const cmp = data.length - 6;

    if (len > cmp) {
      this.receiving = data;
      this.receiveLength = len;
    } else {
      let process = data;
      let remaining = null;

      if (len < cmp) {
        process = data.slice(0, len + 6);
        remaining = data.slice(len + 6, cmp + 6);
      }

      this.resetReceive();
      this.interpret(new ReadStream(process), this);
      if (remaining) {
        return remaining;
      }
    }
  } else {
    console.info('Data received');
    let newData = Buffer.concat([this.receiving, data], this.receiving.length + data.length);
    const pduLength = newData.length - 6;

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
};

CSocket.prototype.interpret = (stream) => {
  const pdatas = [];
  const size = stream.size();

  while (stream.offset < size) {
    const pdu = PDU.createByStream(stream);
    // Console.log("Received PDU-TYPE " + PDU.typeToString(pdu.type));

    if (pdu.is(C.ITEM_TYPE_PDU_ASSOCIATE_AC)) {
      pdu.presentationContextItems.forEach((ctx) => {
        const requested = this.getContext(ctx.presentationContextID);

        if (!requested) {
          throw new Error('Accepted presentation context not found');
        }

        this.negotiatedContexts[ctx.presentationContextID] = {
          id: ctx.presentationContextID,
          transferSyntax: ctx.transferSyntaxesItems[0].transferSyntaxName,
          abstractSyntax: requested.abstractSyntax
        };
      });

      // Console.log('Accepted');
      this.associated = true;
      this.emit('associated', pdu);
    } else if (pdu.is(C.ITEM_TYPE_PDU_RELEASE_RP)) {
      // Console.log('Released');
      this.associated = false;
      this.emit('released');
    } else if (pdu.is(C.ITEM_TYPE_PDU_AABORT)) {
      // Console.log('Aborted');
      this.emit('aborted', pdu);
    } else if (pdu.is(C.ITEM_TYPE_PDU_PDATA)) {
      pdatas.push(pdu);
    }
  }

  if (pdatas) {
    let pdvs = this.pendingPDVs ? this.pendingPDVs : [];

    pdatas.forEach((pdata) => {
      pdvs = pdvs.concat(pdata.presentationDataValueItems);
    });
    this.pendingPDVs = null;
    let i = 0;
    const count = pdvs.length;

    while (i < count) {
      if (pdvs[i].isLast) {
        this.emit('message', pdvs[i++]);
      } else {
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
      }
    }
  }
};

CSocket.prototype.receivedMessage = (pdv) => {
  const syntax = this.getSyntax(pdv.contextId);
  const msg = DicomMessage.read(pdv.messageStream, pdv.type, syntax, this.options.vr);

  if (msg.isCommand()) {
    this.lastCommand = msg;

    if (msg.isResponse()) {
      const replyId = msg.respondedTo();
      const listener = this.messages[replyId].listener;

      if (msg.is(C.COMMAND_C_GET_RSP) || msg.is(C.COMMAND_C_MOVE_RSP)) {
        // Console.log('remaining', msg.getNumOfRemainingSubOperations(), msg.getNumOfCompletedSubOperations());
      }

      if (msg.failure()) {
        console.info('message failed with status ', msg.getStatus().toString(16));
      }

      listener.emit('response', msg);
      if (msg.isFinal()) {
        if (listener) {
          listener.emit('end', msg);

          if (!msg.haveData()) {
            delete this.messages[replyId];
          }
        }

        if (msg.is(C.COMMAND_C_GET_RSP)) {
          if (!msg.getNumOfRemainingSubOperations()) {
            if (this.lastGets && this.lastGets.length > 0) {
              this.lastGets.shift();
            }
          }
        }
      }
    } else {

      /* If (msg.is(0x01)) {
        console.log('ae title ', msg.getValue(0x00001031))
      }*/
    }

  } else {
    if (!this.lastCommand) {
      throw new Error('Only dataset?');
    } else if (!this.lastCommand.haveData()) {
      throw new Error('Last command didn\'t indicate presence of data');
    }

    if (this.lastCommand.isResponse()) {
      const replyId = this.lastCommand.respondedTo();

      if (this.messages[replyId].listener) {
        const flag = Boolean(this.lastCommand.failure());

        this.messages[replyId].listener.emit('result', msg, flag);

        if (this.lastCommand.failure()) {
          delete this.messages[replyId];
        }
      }
    } else if (this.lastCommand.is(C.COMMAND_C_STORE_RQ)) {
      const moveMessageId = this.lastCommand.getMoveMessageId();
      let useId = moveMessageId;

      if (moveMessageId) {
        console.info('move ', moveMessageId);
      }

      // !! Going to deprecate now
      // Kinda hacky but we know this c-store is came from a c-get
      if (this.lastGets.length > 0) {
        useId = this.lastGets[0];
      } else {
        throw new Error('Where does this c-store came from?');
      }

      // This.storeResponse(useId, msg);
    }
  }
};

CSocket.prototype.wrapToPData = (message, context) => {
  const useContext = message.contextUID ? message.contextUID : context;
  const ctx = this.getContextByUID(useContext);

  const pdata = new PDataTF();
  const pdv = new PresentationDataValueItem(ctx.id);

  pdv.setMessage(message);
  pdata.setPresentationDataValueItems([pdv]);

  return pdata;
};

CSocket.prototype.sendMessage = (context, command, dataset) => {
  const nContext = this.getContextByUID(context);
  const syntax = nContext.transferSyntax;
  const cid = nContext.id;
  const messageId = this.newMessageId();
  const msgData = {};

  msgData.listener = new Envelope(command);

  msgData.listener.on('cancel', () => {
    let cancelMessage = null;

    if (this.command.is(C.COMMAND_C_FIND_RQ) || this.command.is(C.COMMAND_C_MOVE_RQ)) {
      cancelMessage = new CCancelRQ();

      cancelMessage.setReplyMessageId(this.command.messageId);
      cancelMessage.setSyntax(C.IMPLICIT_LITTLE_ENDIAN);

      this.send(this.wrapToPData(cancelMessage, this.command.contextUID));
    }
  });

  command.setSyntax(C.IMPLICIT_LITTLE_ENDIAN);
  command.setContextId(context);
  command.setMessageId(messageId);
  if (dataset) {
    command.setDataSetPresent(C.DATA_SET_PRESENT);
  }

  this.lastSent = command;
  if (command.is(C.COMMAND_C_GET_RQ)) {
    this.lastGets.push(messageId);
  }

  const pdata = this.wrapToPData(command);

  msgData.command = command;
  this.messages[messageId] = msgData;
  console.info(`Sending command ${command.typeString()}`);
  this.send(pdata);
  if (dataset && typeof dataset === 'object') {
    dataset.setSyntax(syntax);
    const dsData = new PDataTF();
    const dPdv = new PresentationDataValueItem(cid);

    dPdv.setMessage(dataset);
    dsData.setPresentationDataValueItems([dPdv]);
    this.send(dsData);
  }

  return msgData.listener;
};

CSocket.prototype.sendPData = (pdv, after) => {
  const pdata = new PDataTF();

  pdata.setPresentationDataValueItems([pdv]);
  // Console.log('Sending pdata');
  // Console.log(pdata.totalLength());
  this.send(pdata, after);
};

CSocket.prototype.verify = () => {
  this.setPresentationContexts([C.SOP_VERIFICATION]);
  this.startAssociationRequest(() => {
    // Associated, we can release now
    this.release();
  });
};

CSocket.prototype.wrapMessage = (data) => {
  if (data) {
    const datasetMessage = new DataSetMessage();

    datasetMessage.setElements(data);

    return datasetMessage;
  }

  return data;

};

CSocket.prototype.find = (params, options) => this.sendMessage(options.context, new CFindRQ(), this.wrapMessage(params));

CSocket.prototype.move = (destination, params, options) => {
  const moveMessage = new CMoveRQ();

  moveMessage.setDestination(destination);

  return this.sendMessage(options.context, moveMessage, this.wrapMessage(params));
};

CSocket.prototype.storeInstance = (sopClassUID, sopInstanceUID, options) => {
  const storeMessage = new CStoreRQ();

  storeMessage.setAffectedSOPInstanceUID(sopInstanceUID);
  storeMessage.setAffectedSOPClassUID(sopClassUID);

  return this.sendMessage(sopClassUID, storeMessage, true);
};

CSocket.prototype.moveInstances = (destination, params, options) => {
  const sendParams = Object.assign({
    0x00080052: C.QUERY_RETRIEVE_LEVEL_IMAGE
  }, params);

  options = Object.assign({
    context: C.SOP_STUDY_ROOT_MOVE
  }, options);

  return this.move(destination, sendParams, options);
};

CSocket.prototype.findPatients = (params, options) => {
  const sendParams = Object.assign({
    0x00080052: C.QUERY_RETRIEVE_LEVEL_PATIENT,
    0x00100010: '',
    0x00100020: '',
    0x00100030: '',
    0x00100040: ''
  }, params);

  options = Object.assign({
    context: C.SOP_PATIENT_ROOT_FIND
  }, options);

  return this.find(sendParams, options);
};

CSocket.prototype.findStudies = (params, options) => {
  const sendParams = Object.assign({
    0x00080052: C.QUERY_RETRIEVE_LEVEL_STUDY,
    0x00080020: '',
    0x00100010: '',
    0x00080061: '',
    0x0020000D: ''
  }, params);

  options = Object.assign({
    context: C.SOP_STUDY_ROOT_FIND
  }, options);

  return this.find(sendParams, options);
};

CSocket.prototype.findSeries = (params, options) => {
  const sendParams = Object.assign({
    0x00080052: C.QUERY_RETRIEVE_LEVEL_SERIES,
    0x00080020: '',
    0x0020000E: '',
    0x0008103E: '',
    0x0020000D: ''
  }, params);

  options = Object.assign({
    context: C.SOP_STUDY_ROOT_FIND
  }, options);

  return this.find(sendParams, options);
};

CSocket.prototype.findInstances = (params, options) => {
  const sendParams = Object.assign({
    0x00080052: C.QUERY_RETRIEVE_LEVEL_IMAGE,
    0x00080020: '',
    0x0020000E: '',
    0x0008103E: '',
    0x0020000D: ''
  }, params);

  options = Object.assign({
    context: C.SOP_STUDY_ROOT_FIND
  }, options);

  return this.find(sendParams, options);
};

export default CSocket;
