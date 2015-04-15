import * as D from './Data'

export class DicomMessage {
  constructor(syntax) {
    this.syntax = syntax ? syntax : null;
    this.type = C.DATA_TYPE_COMMAND;
    this.messageId = C.DEFAULT_MESSAGE_ID;
    this.elementPairs = {};
  }

  isCommand() {
    return this.type == C.DATA_TYPE_COMMAND;
  }

  setSyntax(syntax) {
    this.syntax = syntax;

    for (var tag in this.elementPairs) {
      this.elementPairs[tag].setSyntax(this.syntax);
    }  
  }

  setMessageId(id) {
    this.messageId = id;
  }

  setReplyMessageId(id) {
    this.replyMessageId = id;
  }

  command(cmds) {
    cmds.unshift(this.newElement(0x00000800, this.dataSetPresent ? C.DATA_SET_PRESENT : C.DATE_SET_ABSENCE));
    cmds.unshift(this.newElement(0x00000700, this.priority));
    cmds.unshift(this.newElement(0x00000110, this.messageId));
    cmds.unshift(this.newElement(0x00000100, this.commandType));
    cmds.unshift(this.newElement(0x00000002, this.contextUID));

    let length = 0;
    for (let cmd of cmds) {
      length += cmd.length(cmd.getFields());
    }

    cmds.unshift(this.newElement(0x00000000, length));
    return cmds;
  }

  response(cmds) {
    cmds.unshift(this.newElement(0x00000800, this.dataSetPresent ? C.DATA_SET_PRESENT : C.DATE_SET_ABSENCE));
    cmds.unshift(this.newElement(0x00000120, this.replyMessageId));
    cmds.unshift(this.newElement(0x00000100, this.commandType));
    cmds.unshift(this.newElement(0x00000002, this.contextUID));

    let length = 0;
    for (let cmd of cmds) {
      length += cmd.length(cmd.getFields());
    }

    cmds.unshift(this.newElement(0x00000000, length));
    return cmds;
  }  

  setElements(pairs) {
    let p = {};
    for (var tag in pairs) {
      p[tag] = this.newElement(tag, pairs[tag]);
    }
    this.elementPairs = p;
  }  

  newElement(tag, value) {
    return D.elementByType(tag, value, this.syntax);
  }

  setElement(key, value) {
    this.elementPairs[key] = D.elementByType(key, value);
  }

  setElementPairs(pairs) {
    this.elementPairs = pairs;
  }

  setContextId(context) {
    this.contextUID = context;
  }

  setPriority(pri) {
    this.priority = pri;
  }

  setType(type) {
    this.type = type;
  }

  setDataSetPresent(present) {
    this.dataSetPresent = present == 0x0101 ? false : true;
  }

  haveData() {
    return this.dataSetPresent;
  }  

  tags() {
    return Object.keys(this.elementPairs);
  }

  key(tag) {
    return D.elementKeywordByTag(tag);
  }

  getValue(tag) {
    return this.elementPairs[tag] ? this.elementPairs[tag].getValue() : null;
  }

  affectedSOPClassUID() {
    return this.getValue(0x00000002);
  }  

  getMessageId() {
    return this.getValue(0x00000110);
  }

  getFields() {
    let eles = [];
    for (var tag in this.elementPairs) {
      eles.push(this.elementPairs[tag]);
    }
    return eles;
  }  

  length(elems) {
    let len = 0;
    for (let elem of elems) {
      len += elem.length(elem.getFields());
    }
    return len;
  }

  isResponse() {
    return false;
  }

  is(type) {
    return this.commandType == type;
  }  

  write(stream) {
    let fields = this.getFields();
    for (let field of fields) {
      field.setSyntax(this.syntax);
      field.write(stream);
    }
  }

  printElements(pairs, indent) {
    let typeName = "";
    for (var tag in pairs) {
      let value = pairs[tag].getValue();
      typeName += (" ".repeat(indent)) + this.key(tag) + " : ";
      if (value instanceof Array) {
        for (let p of value) {
          if (typeof p == "object") {
            typeName += "[\n" + this.printElements(p, indent + 2) + (" ".repeat(indent)) + "]";
          } else {
            typeName += "[" + p + "]";
          }
        }
        if (typeName[typeName.length-1] != "\n") {
          typeName += "\n";
        }
      } else {
        typeName += value + "\n";
      }
    }
    return typeName;
  }

  toString() {
    let typeName = "";
    if (!this.isCommand()) {
      typeName = "DateSet Message";
    } else {
      switch (this.commandType) {
        case C.COMMAND_C_GET_RSP   : typeName = "C-GET-RSP"; break;
        case C.COMMAND_C_MOVE_RSP  : typeName = "C-MOVE-RSP"; break;
        case C.COMMAND_C_GET_RQ    : typeName = "C-GET-RQ"; break;
        case C.COMMAND_C_STORE_RQ  : typeName = "C-STORE-RQ"; break;
        case C.COMMAND_C_FIND_RSP  : typeName = "C-FIND-RSP"; break;
        case C.COMMAND_C_MOVE_RQ   : typeName = "C-MOVE-RQ"; break;
        case C.COMMAND_C_FIND_RQ   : typeName = "C-FIND-RQ"; break;
        case C.COMMAND_C_STORE_RSP : typeName = "C-STORE-RSP"; break;
      }      
    }
    typeName += " [\n";
    typeName += this.printElements(this.elementPairs, 0);
    typeName += "]";
    return typeName;
  }

  walkObject(pairs) {
    let obj = {};
    for (var tag in pairs) {
      let v = pairs[tag].getValue(), u = v;
      if (v instanceof Array) {
        u = [];
        for (let a of v) {
          if (typeof a == 'object') {
            u.push(this.walkObject(a));
          } else u.push(a);
        }
      }
      obj[tag] = u;
    }

    return obj;
  }

  toObject() {
    return this.walkObject(this.elementPairs);
  }
}

export function readMessage(stream, type, syntax) {
  let elements = [], pairs = {}, useSyntax = type == C.DATA_TYPE_COMMAND ? C.IMPLICIT_LITTLE_ENDIAN : syntax;
  stream.reset();
  while (!stream.end()) {
    let elem = new D.DataElement();
    elem.setSyntax(useSyntax);
    elem.readBytes(stream);//return;
    pairs[elem.tag.value] = elem;
  }

  let message = null;
  if (type == C.DATA_TYPE_COMMAND) {
    let cmdType = pairs[0x00000100].value;

    switch (cmdType) {
      case 0x8020 : message = new CFindRSP(useSyntax); break;
      case 0x8021 : message = new CMoveRSP(useSyntax); break;
      case 0x8010 : message = new CGetRSP(useSyntax); break;
      case 0x0001 : message = new CStoreRQ(useSyntax); break;
      default : throw "Unrecognized command type " + cmdType.toString(16); break;
    }

    message.setElementPairs(pairs);
    message.setDataSetPresent(message.getValue(0x00000800));
    message.setContextId(message.getValue(0x00000002));
    if (!message.isResponse()) {
      message.setMessageId(message.getValue(0x00000110));
    } else {
      message.setReplyMessageId(message.getValue(0x00000120));
    }
  } else if (type == C.DATA_TYPE_DATA) {
    message = new DataSetMessage(useSyntax);
    message.setElementPairs(pairs);
  } else {
    throw "Unrecognized message type";
  }
  return message;
}

export class DataSetMessage extends DicomMessage {
  constructor(syntax) {
    super(syntax);
    this.type = C.DATA_TYPE_DATA;
  }

  is(type) {
    return false;
  }
}

export class CommandMessage extends DicomMessage {
  constructor(syntax) {
    super(syntax);
    this.type = C.DATA_TYPE_COMMAND;
    this.priority = C.PRIORITY_MEDIUM;
    this.dataSetPresent = true;    
  }  

  getFields() {
    return this.command(super.getFields());
  }  
}

export class CommandResponse extends DicomMessage {
  constructor(syntax) {
    super(syntax);
    this.type = C.DATA_TYPE_COMMAND;
    this.dataSetPresent = true;
  }

  isResponse() {
    return true;
  }

  respondedTo() {
    return this.getValue(0x00000120);
  }

  isFinal() {
    return this.success() || this.failure() || this.cancel();
  }

  warning() {
    let status = this.getStatus();
    return (status == 0x0001) || (status >> 12 == 0xb);
  }

  success() {
    return this.getStatus() == 0x0000;
  }

  failure() {
    let status = this.getStatus();
    return (status >> 12 == 0xa) || (status >> 12 == 0xc) || (status >> 8 == 0x1)
  }

  cancel() {
    return this.getStatus() == C.STATUS_CANCEL;
  }

  pending() {
    let status = this.getStatus();
    return (status == 0xff00) || (status == 0xff01);
  }

  getStatus() {
    return this.getValue(0x00000900);
  }

  setStatus(status) {
    this.setElement(0x00000900, status);
  }

  // following four methods only available to C-GET-RSP and C-MOVE-RSP
  getNumOfRemainingSubOperations() {
    return this.getValue(0x00001020);
  }

  getNumOfCompletedSubOperations() {
    return this.getValue(0x00001021);
  }

  getNumOfFailedSubOperations() {
    return this.getValue(0x00001022);
  }

  getNumOfWarningSubOperations() {
    return this.getValue(0x00001023);
  }
  //end

  getFields() {
    return this.response(super.getFields());
  }
}

export class CFindRSP extends CommandResponse {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x8020;
  }
}

export class CGetRSP extends CommandResponse {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x8010;
  }
}

export class CMoveRSP extends CommandResponse {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x8021;
  }  
}

export class CFindRQ extends CommandMessage {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x20;
    this.contextUID = C.SOP_STUDY_ROOT_FIND;
  }
}

export class CMoveRQ extends CommandMessage {
  constructor(syntax, destination) {
    super(syntax);
    this.commandType = 0x21;
    this.contextUID = C.SOP_STUDY_ROOT_MOVE;
    this.setDestination(destination || "");
  }

  setStore(cstr) {
    this.store = cstr;
  }  

  setDestination(dest) {
    this.setElements({
      0x00000600 : dest
    });    
  }
}

export class CGetRQ extends CommandMessage {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x10;
    this.contextUID = C.SOP_STUDY_ROOT_GET;
    this.store = null;
  }

  setStore(cstr) {
    this.store = cstr;
  }
}

export class CStoreRQ extends CommandMessage {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x01;
    this.contextUID = C.SOP_STUDY_ROOT_GET;
  }

  getOriginAETitle() {
    return this.getValue(0x00001030);
  }

  getMoveMessageId() {
    return this.getValue(0x00001031);
  }

  getSOPInstanceUID() {
    return this.getValue(0x00001000);
  }
}

export class CStoreRSP extends CommandResponse {
  constructor(syntax) {
    super(syntax);
    this.commandType = 0x8001;
    this.contextUID = C.SOP_STUDY_ROOT_GET;
    this.dataSetPresent = false;
  }

  setAffectedSOPInstanceUID(uid) {
    this.setElement(0x00001000, uid);
  }  

  getAffectedSOPInstanceUID(uid) {
    return this.getValue(0x00001000);
  } 
}