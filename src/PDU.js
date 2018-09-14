import fs from 'fs';
import util from 'util';
import { EventEmitter } from 'events';
import C from './constants.js';
import { DicomMessage } from './Message.js';
import {
  ReservedField,
  HexField,
  UInt8Field,
  UInt16Field,
  UInt32Field,
  FilledField,
  BufferField,
  StringField } from './Field.js';
import { WriteStream } from './RWStream.js';
import { quitWithError } from './require.js';

const PDVHandle = () => {};

util.inherits(PDVHandle, EventEmitter);

const PDU = () => {
  this.fields = [];
  this.lengthBytes = 4;
};

PDU.prototype.length = (fields) => {
  let len = 0;

  fields.forEach((f) => {
    len += f.getFields ? f.length(f.getFields()) : f.length();
  });

  return len;
};

PDU.prototype.is = (type) => this.type === type;

PDU.prototype.getFields = (fields) => {
  const len = this.lengthField(fields);

  fields.unshift(len);
  if (this.type !== null) {
    fields.unshift(new ReservedField());
    fields.unshift(new HexField(this.type));
  }

  return fields;
};

PDU.prototype.lengthField = (fields) => {
  if (this.lengthBytes === 4) {
    return new UInt32Field(this.length(fields));
  } else if (this.lengthBytes === 2) {
    return new UInt16Field(this.length(fields));
  }
  throw new Error('Invalid length bytes');

};

PDU.prototype.read = (stream) => {
  stream.read(C.TYPE_HEX, 1);
  const length = stream.read(C.TYPE_UINT32);

  this.readBytes(stream, length);
};

PDU.prototype.load = (stream) => PDU.createByStream(stream);

PDU.prototype.loadPDV = (stream, length) => {
  if (stream.end()) {
    return false;
  }
  let bytesRead = 0;
  const pdvs = [];

  while (bytesRead < length) {
    const plength = stream.read(C.TYPE_UINT32);
    const pdv = new PresentationDataValueItem();

    pdv.readBytes(stream, plength);
    bytesRead += plength + 4;

    pdvs.push(pdv);
  }

  return pdvs;
};

PDU.prototype.loadDicomMessage = (stream, isCommand, isLast) => {
  const message = DicomMessage.read(stream, isCommand, isLast);

  return message;
};

PDU.prototype.stream = () => {
  const stream = new WriteStream();
  const fields = this.getFields();

  // Writing to buffer
  fields.forEach((field) => {
    field.write(stream);
  });

  return stream;
};

PDU.prototype.buffer = () => this.stream().buffer();

// TODO: Seems that we don't use it.
// Const interpretCommand = (stream, isLast) => {
//   ParseDicomMessage(stream);
// };

const mergePDVs = (pdvs) => {
  const merges = [];
  const count = pdvs.length;
  let i = 0;

  while (i < count) {
    console.log(pdvs[i].isLast, pdvs[i].type);
    if (pdvs[i].isLast) {
      merges.push(pdvs[i++]);
    } else {
      let j = i;

      while (!pdvs[j++].isLast && j < count) {
        pdvs[i].messageStream.concat(pdvs[j].messageStream);
      }
      merges.push(pdvs[i]);
      i = j;
    }
  }

  return merges;
};

PDU.splitPData = (pdata, maxSize) => {
  const totalLength = pdata.totalLength();

  if (totalLength > maxSize) {
    // Split into chunks of pdatas
    const chunks = Math.floor(totalLength / maxSize);
    const left = totalLength % maxSize;

    for (let i = 0; i < chunks; i++) {
      if (i === chunks - 1) {
        if (left < 6) {
          // Need to move some of the last chunk
        }
      }
    }
  } else {
    return [pdata];
  }
};

const readChunk = (fd, bufferSize, slice, callback) => {
  const buffer = Buffer.alloc(bufferSize);
  const length = slice.length;
  const start = slice.start;

  fs.read(fd, buffer, 0, length, start, (err, bytesRead) => {
    callback(err, bytesRead, buffer, slice);
  });
};

PDU.generatePDatas = (context, bufferOrFile, maxSize, length, metaLength, callback) => {
  let total;
  let isFile = false;

  if (typeof bufferOrFile === 'string') {
    const stats = fs.statSync(bufferOrFile);

    total = stats.size;
    isFile = true;
  } else if (bufferOrFile instanceof Buffer) {
    total = length ? length : bufferOrFile.length;
  }
  const handler = new PDVHandle();

  const slices = [];
  let start = metaLength + 144;
  let index = 0;

  maxSize -= 6;
  while (start < total) {
    let sliceLength = maxSize,
      isLast = false;

    if (total - start < maxSize) {
      sliceLength = total - start;
      isLast = true;
    }
    slices.push({ start,
      length: sliceLength,
      isLast,
      index });
    start += sliceLength;
    index++;
  }

  if (isFile) {
    fs.open(bufferOrFile, 'r', (err, fd) => {
      if (err) {
        // Fs.closeSync(fd);
        return quitWithError(err, callback);
      }
      callback(null, handler);

      const after = (err, bytesRead, buffer, slice) => {
        if (err) {
          fs.closeSync(fd);
          handler.emit('error', err);

          return;
        }
        const pdv = new RawDataPDV(context, buffer, 0, slice.length, slice.isLast);

        handler.emit('pdv', pdv);

        if (slices.length < 1) {
          handler.emit('end');
          fs.closeSync(fd);
        } else {
          const next = slices.shift();

          readChunk(fd, maxSize, next, after);
        }
      };

      const sl = slices.shift();

      readChunk(fd, maxSize, sl, after);
    });
  } else {
    for (let i = 0; i < slices.length; i++) {
      const toSlice = slices[i];

      const buffer = bufferOrFile.slice(toSlice.start, toSlice.length);
      const pdv = new RawDataPDV(context, buffer, 0, toSlice.length, toSlice.isLast);

      handler.emit('pdv', pdv);

      if (i === slices.length - 1) {
        handler.emit('end');
      }
    }
  }

  return;
};

PDU.typeToString = (type) => {
  let pdu = null;
  const typeNum = parseInt(type, 16);
  // Console.log("RECEIVED PDU-TYPE ", typeNum);

  switch (typeNum) {
  case 0x01:
    pdu = 'ASSOCIATE-RQ';
    break;
  case 0x02:
    pdu = 'ASSOCIATE-AC';
    break;
  case 0x04:
    pdu = 'P-DATA-TF';
    break;
  case 0x06:
    pdu = 'RELEASE-RP';
    break;
  case 0x07:
    pdu = 'ASSOCIATE-ABORT';
    break;
  case 0x10:
    pdu = 'APPLICATION-CONTEXT-ITEM';
    break;
  case 0x20:
    pdu = 'PRESENTATION-CONTEXT-ITEM';
    break;
  case 0x21:
    pdu = 'PRESENTATION-CONTEXT-ITEM-AC';
    break;
  case 0x30:
    pdu = 'ABSTRACT-SYNTAX-ITEM';
    break;
  case 0x40:
    pdu = 'TRANSFER-SYNTAX-ITEM';
    break;
  case 0x50:
    pdu = 'USER-INFORMATION-ITEM';
    break;
  case 0x51:
    pdu = 'MAXIMUM-LENGTH-ITEM';
    break;
  case 0x52:
    pdu = 'IMPLEMENTATION-CLASS-UID-ITEM';
    break;
  case 0x55:
    pdu = 'IMPLEMENTATION-VERSION-NAME-ITEM';
    break;
  default : break;
  }

  return pdu;
};

PDU.createByStream = (stream) => {
  if (stream.end()) {
    return null;
  }

  const pduType = stream.read(C.TYPE_HEX, 1);
  const typeNum = parseInt(pduType, 16);
  let pdu = null;
  // Console.log("RECEIVED PDU-TYPE ", pduType);

  switch (typeNum) {
  case 0x01:
    pdu = new AssociateRQ();
    break;
  case 0x02:
    pdu = new AssociateAC();
    break;
  case 0x04:
    pdu = new PDataTF();
    break;
  case 0x06:
    pdu = new ReleaseRP();
    break;
  case 0x07:
    pdu = new AssociateAbort();
    break;
  case 0x10:
    pdu = new ApplicationContextItem();
    break;
  case 0x20:
    pdu = new PresentationContextItem();
    break;
  case 0x21:
    pdu = new PresentationContextItemAC();
    break;
  case 0x30:
    pdu = new AbstractSyntaxItem();
    break;
  case 0x40:
    pdu = new TransferSyntaxItem();
    break;
  case 0x50:
    pdu = new UserInformationItem();
    break;
  case 0x51:
    pdu = new MaximumLengthItem();
    break;
  case 0x52:
    pdu = new ImplementationClassUIDItem();
    break;
  case 0x55:
    pdu = new ImplementationVersionNameItem();
    break;
  default : throw new Error(`Unrecoginized pdu type ${pduType}`);
  }
  if (pdu) {
    pdu.read(stream);
  }

  return pdu;
};

const nextItemIs = (stream, pduType) => {
  if (stream.end()) {
    return false;
  }

  const nextType = stream.read(C.TYPE_HEX, 1);

  stream.increment(-1);

  return pduType === nextType;
};

const AssociateRQ = () => {
  PDU.call(this);
  this.type = C.ITEM_TYPE_PDU_ASSOCIATE_RQ;
  this.protocolVersion = 1;
};

util.inherits(AssociateRQ, PDU);

AssociateRQ.prototype.setProtocolVersion = (version) => {
  this.protocolVersion = version;
};

AssociateRQ.prototype.setCalledAETitle = (title) => {
  this.calledAETitle = title;
};

AssociateRQ.prototype.setCallingAETitle = (title) => {
  this.callingAETitle = title;
};

AssociateRQ.prototype.setApplicationContextItem = (item) => {
  this.applicationContextItem = item;
};

AssociateRQ.prototype.setPresentationContextItems = (items) => {
  this.presentationContextItems = items;
};

AssociateRQ.prototype.setUserInformationItem = (item) => {
  this.userInformationItem = item;
};

AssociateRQ.prototype.allAccepted = () => {
  for (const i in this.presentationContextItems) {
    const item = this.presentationContextItems[i];

    if (!item.accepted()) {
      return false;
    }
  }

  return true;
};

AssociateRQ.prototype.getFields = () => {
  const f = [
    new UInt16Field(this.protocolVersion), new ReservedField(2),
    new FilledField(this.calledAETitle, 16), new FilledField(this.callingAETitle, 16),
    new ReservedField(32), this.applicationContextItem
  ];

  this.presentationContextItems.forEach((context) => {
    f.push(context);
  });

  f.push(this.userInformationItem);

  return AssociateRQ.super_.prototype.getFields.call(this, f);
};

AssociateRQ.prototype.readBytes = (stream) => {
  this.type = C.ITEM_TYPE_PDU_ASSOCIATE_RQ;
  const version = stream.read(C.TYPE_UINT16);

  this.setProtocolVersion(version);
  stream.increment(2);
  const calledAE = stream.read(C.TYPE_ASCII, 16);

  this.setCalledAETitle(calledAE);
  const callingAE = stream.read(C.TYPE_ASCII, 16);

  this.setCallingAETitle(callingAE);
  stream.increment(32);

  const appContext = this.load(stream);

  this.setApplicationContextItem(appContext);

  const presContexts = [];

  do {
    presContexts.push(this.load(stream));
  } while (nextItemIs(stream, C.ITEM_TYPE_PRESENTATION_CONTEXT));
  this.setPresentationContextItems(presContexts);

  const userItem = this.load(stream);

  this.setUserInformationItem(userItem);
};

AssociateRQ.prototype.buffer = () => AssociateRQ.super_.prototype.buffer.call(this);

const AssociateAC = () => {
  AssociateRQ.call(this);
};

util.inherits(AssociateAC, AssociateRQ);

AssociateAC.prototype.readBytes = (stream) => {
  this.type = C.ITEM_TYPE_PDU_ASSOCIATE_AC;
  const version = stream.read(C.TYPE_UINT16);

  this.setProtocolVersion(version);
  stream.increment(66);

  const appContext = this.load(stream);

  this.setApplicationContextItem(appContext);

  const presContexts = [];

  do {
    presContexts.push(this.load(stream));
  } while (nextItemIs(stream, C.ITEM_TYPE_PRESENTATION_CONTEXT_AC));
  this.setPresentationContextItems(presContexts);

  const userItem = this.load(stream);

  this.setUserInformationItem(userItem);
};

AssociateAC.prototype.getMaxSize = () => {
  const items = this.userInformationItem.userDataItems;
  const length = items.length;
  let size = null;

  for (let i = 0; i < length; i++) {
    if (items[i].is(C.ITEM_TYPE_MAXIMUM_LENGTH)) {
      size = items[i].maximumLengthReceived;
      break;
    }
  }

  return size;
};

const AssociateAbort = () => {
  this.type = C.ITEM_TYPE_PDU_AABORT;
  this.source = 1;
  this.reason = 0;
  PDU.call(this);
};

util.inherits(AssociateAbort, PDU);

AssociateAbort.prototype.setSource = (src) => {
  this.source = src;
};

AssociateAbort.prototype.setReason = (reason) => {
  this.reason = reason;
};

AssociateAbort.prototype.readBytes = (stream) => {
  stream.increment(2);

  const source = stream.read(C.TYPE_UINT8);

  this.setSource(source);

  const reason = stream.read(C.TYPE_UINT8);

  this.setReason(reason);
};

AssociateAbort.prototype.getFields = () => AssociateAbort.super_.prototype.getFields.call(this, [
  new ReservedField(),
  new ReservedField(),
  new UInt8Field(this.source),
  new UInt8Field(this.reason)
]);

const ReleaseRQ = () => {
  this.type = C.ITEM_TYPE_PDU_RELEASE_RQ;
  PDU.call(this);
};

util.inherits(ReleaseRQ, PDU);

ReleaseRQ.prototype.getFields = () => ReleaseRQ.super_.prototype.getFields.call(this, [new ReservedField(4)]);

const ReleaseRP = () => {
  this.type = C.ITEM_TYPE_PDU_RELEASE_RP;
  PDU.call(this);
};

util.inherits(ReleaseRP, PDU);

ReleaseRP.prototype.readBytes = (stream) => {
  stream.increment(4);
};

ReleaseRP.prototype.getFields = () => ReleaseRP.super_.prototype.getFields.call(this, [new ReservedField(4)]);

const PDataTF = () => {
  this.type = C.ITEM_TYPE_PDU_PDATA;
  this.presentationDataValueItems = [];
  PDU.call(this);
};

util.inherits(PDataTF, PDU);

PDataTF.prototype.setPresentationDataValueItems = (items) => {
  this.presentationDataValueItems = items ? items : [];
};

PDataTF.prototype.getFields = () => {
  const fields = this.presentationDataValueItems;

  return PDataTF.super_.prototype.getFields.call(this, fields);
};

PDataTF.prototype.totalLength = () => {
  const fields = this.presentationDataValueItems;

  return this.length(fields);
};

PDataTF.prototype.readBytes = (stream, length) => {
  const pdvs = this.loadPDV(stream, length);
  // Let merges = mergePDVs(pdvs);

  this.setPresentationDataValueItems(pdvs);
};

const Item = () => {
  PDU.call(this);
  this.lengthBytes = 2;
};

util.inherits(Item, PDU);

Item.prototype.read = (stream) => {
  stream.read(C.TYPE_HEX, 1);
  const length = stream.read(C.TYPE_UINT16);

  this.readBytes(stream, length);
};

Item.prototype.write = (stream) => {
  stream.concat(this.stream());
};

Item.prototype.getFields = (fields) => Item.super_.prototype.getFields.call(this, fields);

const PresentationDataValueItem = (context) => {
  this.type = null;
  this.isLast = true;
  this.dataFragment = null;
  this.contextId = context;
  this.messageStream = null;
  Item.call(this);

  this.lengthBytes = 4;
};

util.inherits(PresentationDataValueItem, Item);

PresentationDataValueItem.prototype.setContextId = (id) => {
  this.contextId = id;
};

PresentationDataValueItem.prototype.setFlag = (flag) => {
  this.flag = flag;
};

PresentationDataValueItem.prototype.setPresentationDataValue = (pdv) => {
  this.pdv = pdv;
};

PresentationDataValueItem.prototype.setMessage = (msg) => {
  this.dataFragment = msg;
};

PresentationDataValueItem.prototype.getMessage = () => this.dataFragment;

PresentationDataValueItem.prototype.readBytes = (stream, length) => {
  this.contextId = stream.read(C.TYPE_UINT8);
  const messageHeader = stream.read(C.TYPE_UINT8);

  this.isLast = messageHeader >> 1;
  this.type = messageHeader & 1 ? C.DATA_TYPE_COMMAND : C.DATA_TYPE_DATA;

  // Load dicom messages
  this.messageStream = stream.more(length - 2);
};

PresentationDataValueItem.prototype.getFields = () => {
  const fields = [new UInt8Field(this.contextId)];
  // Define header
  const messageHeader = (1 & this.dataFragment.type) | ((this.isLast ? 1 : 0) << 1);

  fields.push(new UInt8Field(messageHeader));

  fields.push(this.dataFragment);

  return PresentationDataValueItem.super_.prototype.getFields.call(this, fields);
};

const RawDataPDV = (context, buffer, start, length, isLast) => {
  this.type = null;
  this.isLast = isLast;
  this.dataFragmentBuffer = buffer;
  this.bufferStart = start;
  this.bufferLength = length;
  this.contextId = context;
  Item.call(this);

  this.lengthBytes = 4;
};

util.inherits(RawDataPDV, Item);

RawDataPDV.prototype.getFields = () => {
  const fields = [new UInt8Field(this.contextId)];
  const messageHeader = (this.isLast ? 1 : 0) << 1;

  fields.push(new UInt8Field(messageHeader));
  fields.push(new BufferField(this.dataFragmentBuffer, this.bufferStart, this.bufferLength));

  return RawDataPDV.super_.prototype.getFields.call(this, fields);
};

const ApplicationContextItem = () => {
  this.type = C.ITEM_TYPE_APPLICATION_CONTEXT;
  this.applicationContextName = C.APPLICATION_CONTEXT_NAME;
  Item.call(this);
};

util.inherits(ApplicationContextItem, Item);

ApplicationContextItem.prototype.setApplicationContextName = (name) => {
  this.applicationContextName = name;
};

ApplicationContextItem.prototype.getFields = () => ApplicationContextItem.super_.prototype.getFields.call(this, [new StringField(this.applicationContextName)]);

ApplicationContextItem.prototype.readBytes = (stream, length) => {
  const appContext = stream.read(C.TYPE_ASCII, length);

  this.setApplicationContextName(appContext);
};

ApplicationContextItem.prototype.buffer = () => ApplicationContextItem.super_.prototype.buffer.call(this);

const PresentationContextItem = () => {
  this.type = C.ITEM_TYPE_PRESENTATION_CONTEXT;
  Item.call(this);
};

util.inherits(PresentationContextItem, Item);

PresentationContextItem.prototype.setPresentationContextID = (id) => {
  this.presentationContextID = id;
};

PresentationContextItem.prototype.setAbstractSyntaxItem = (item) => {
  this.abstractSyntaxItem = item;
};

PresentationContextItem.prototype.setTransferSyntaxesItems = (items) => {
  this.transferSyntaxesItems = items;
};

PresentationContextItem.prototype.setResultReason = (reason) => {
  this.resultReason = reason;
};

PresentationContextItem.prototype.accepted = () => this.resultReason == 0;

PresentationContextItem.prototype.readBytes = (stream) => {
  const contextId = stream.read(C.TYPE_UINT8);

  this.setPresentationContextID(contextId);
  stream.increment(1);
  stream.increment(1);
  stream.increment(1);

  const abstractItem = this.load(stream);

  this.setAbstractSyntaxItem(abstractItem);

  const transContexts = [];

  do {
    transContexts.push(this.load(stream));
  } while (nextItemIs(stream, C.ITEM_TYPE_TRANSFER_CONTEXT));
  this.setTransferSyntaxesItems(transContexts);
};

PresentationContextItem.prototype.getFields = () => {
  const f = [
    new UInt8Field(this.presentationContextID),
    new ReservedField(), new ReservedField(), new ReservedField(), this.abstractSyntaxItem
  ];

  this.transferSyntaxesItems.forEach((syntaxItem) => {
    f.push(syntaxItem);
  });

  return PresentationContextItem.super_.prototype.getFields.call(this, f);
};

PresentationContextItem.prototype.buffer = () => PresentationContextItem.super_.prototype.buffer.call(this);

const PresentationContextItemAC = () => {
  this.type = C.ITEM_TYPE_PRESENTATION_CONTEXT_AC;
  Item.call(this);
};

util.inherits(PresentationContextItemAC, PresentationContextItem);

PresentationContextItemAC.prototype.readBytes = (stream) => {
  const contextId = stream.read(C.TYPE_UINT8);

  this.setPresentationContextID(contextId);
  stream.increment(1);
  const resultReason = stream.read(C.TYPE_UINT8);

  this.setResultReason(resultReason);
  stream.increment(1);

  const transItem = this.load(stream);

  this.setTransferSyntaxesItems([transItem]);
};

const AbstractSyntaxItem = () => {
  this.type = C.ITEM_TYPE_ABSTRACT_CONTEXT;
  Item.call(this);
};

util.inherits(AbstractSyntaxItem, Item);

AbstractSyntaxItem.prototype.setAbstractSyntaxName = (name) => {
  this.abstractSyntaxName = name;
};

AbstractSyntaxItem.prototype.getFields = () => AbstractSyntaxItem.super_.prototype.getFields.call(this, [new StringField(this.abstractSyntaxName)]);

AbstractSyntaxItem.prototype.buffer = () => AbstractSyntaxItem.super_.prototype.buffer.call(this);

AbstractSyntaxItem.prototype.readBytes = (stream, length) => {
  const name = stream.read(C.TYPE_ASCII, length);

  this.setAbstractSyntaxName(name);
};

const TransferSyntaxItem = () => {
  this.type = C.ITEM_TYPE_TRANSFER_CONTEXT;
  Item.call(this);
};

util.inherits(TransferSyntaxItem, Item);

TransferSyntaxItem.prototype.setTransferSyntaxName = (name) => {
  this.transferSyntaxName = name;
};

TransferSyntaxItem.prototype.readBytes = (stream, length) => {
  const transfer = stream.read(C.TYPE_ASCII, length);

  this.setTransferSyntaxName(transfer);
};

TransferSyntaxItem.prototype.getFields = () => TransferSyntaxItem.super_.prototype.getFields.call(this, [new StringField(this.transferSyntaxName)]);

TransferSyntaxItem.prototype.buffer = () => TransferSyntaxItem.super_.prototype.buffer.call(this);

const UserInformationItem = () => {
  this.type = C.ITEM_TYPE_USER_INFORMATION;
  Item.call(this);
};

util.inherits(UserInformationItem, Item);

UserInformationItem.prototype.setUserDataItems = (items) => {
  this.userDataItems = items;
};

UserInformationItem.prototype.readBytes = (stream) => {
  const items = [];
  const pdu = this.load(stream);

  do {
    items.push(pdu);
  } while (pdu === this.load(stream));
  this.setUserDataItems(items);
};

UserInformationItem.prototype.getFields = () => {
  const f = [];

  this.userDataItems.forEach((userData) => {
    f.push(userData);
  });

  return UserInformationItem.super_.prototype.getFields.call(this, f);
};

UserInformationItem.prototype.buffer = () => UserInformationItem.super_.prototype.buffer.call(this);

const ImplementationClassUIDItem = () => {
  this.type = C.ITEM_TYPE_IMPLEMENTATION_UID;
  Item.call(this);
};

util.inherits(ImplementationClassUIDItem, Item);

ImplementationClassUIDItem.prototype.setImplementationClassUID = (id) => {
  this.implementationClassUID = id;
};

ImplementationClassUIDItem.prototype.readBytes = (stream, length) => {
  const uid = stream.read(C.TYPE_ASCII, length);

  this.setImplementationClassUID(uid);
};

ImplementationClassUIDItem.prototype.getFields = () => ImplementationClassUIDItem.super_.prototype.getFields.call(this, [new StringField(this.implementationClassUID)]);

ImplementationClassUIDItem.prototype.buffer = () => ImplementationClassUIDItem.super_.prototype.buffer.call(this);

const ImplementationVersionNameItem = () => {
  this.type = C.ITEM_TYPE_IMPLEMENTATION_VERSION;
  Item.call(this);
};

util.inherits(ImplementationVersionNameItem, Item);

ImplementationVersionNameItem.prototype.setImplementationVersionName = (name) => {
  this.implementationVersionName = name;
};

ImplementationVersionNameItem.prototype.readBytes = (stream, length) => {
  const name = stream.read(C.TYPE_ASCII, length);

  this.setImplementationVersionName(name);
};

ImplementationVersionNameItem.prototype.getFields = () => ImplementationVersionNameItem.super_.prototype.getFields.call(this, [new StringField(this.implementationVersionName)]);

ImplementationVersionNameItem.prototype.buffer = () => ImplementationVersionNameItem.super_.prototype.buffer.call(this);

const MaximumLengthItem = () => {
  this.type = C.ITEM_TYPE_MAXIMUM_LENGTH;
  this.maximumLengthReceived = 32768;
  Item.call(this);
};

util.inherits(MaximumLengthItem, Item);

MaximumLengthItem.prototype.setMaximumLengthReceived = (length) => {
  this.maximumLengthReceived = length;
};

MaximumLengthItem.prototype.readBytes = (stream) => {
  const l = stream.read(C.TYPE_UINT32);

  this.setMaximumLengthReceived(l);
};

MaximumLengthItem.prototype.getFields = () => MaximumLengthItem.super_.prototype.getFields.call(this, [new UInt32Field(this.maximumLengthReceived)]);

MaximumLengthItem.prototype.buffer = () => MaximumLengthItem.super_.prototype.buffer.call(this);

export {
  PDU,
  AssociateAC,
  AssociateRQ,
  AssociateAbort,
  ReleaseRQ,
  ReleaseRP,
  PDataTF,
  ApplicationContextItem,
  PresentationContextItem,
  PresentationContextItemAC,
  PresentationDataValueItem,
  AbstractSyntaxItem,
  TransferSyntaxItem,
  UserInformationItem,
  ImplementationClassUIDItem,
  ImplementationVersionNameItem,
  MaximumLengthItem,
  mergePDVs
};
