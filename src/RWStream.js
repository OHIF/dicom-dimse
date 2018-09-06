import util from 'util';
import C from './constants.js';

const isString = (type) => {
  if (type === C.TYPE_ASCII || type === C.TYPE_HEX) {
    return true;
  }

  return false;

};

const calcLength = (type, value) => {
  let size = NaN;

  switch (type) {
  case C.TYPE_HEX:
    size = Buffer.byteLength(value, 'hex');
    break;
  case C.TYPE_ASCII:
    size = Buffer.byteLength(value, 'ascii');
    break;
  case C.TYPE_UINT8:
    size = 1;
    break;
  case C.TYPE_UINT16:
    size = 2;
    break;
  case C.TYPE_UINT32:
    size = 4;
    break;
  case C.TYPE_FLOAT:
    size = 4;
    break;
  case C.TYPE_DOUBLE:
    size = 8;
    break;
  case C.TYPE_INT8:
    size = 1;
    break;
  case C.TYPE_INT16:
    size = 2;
    break;
  case C.TYPE_INT32:
    size = 4;
    break;
  default :break;
  }

  return size;
};

const RWStream = () => {
  this.endian = C.BIG_ENDIAN;
};

RWStream.prototype.setEndian = (endian) => {
  this.endian = endian;
};

RWStream.prototype.getEncoding = (type) => RWStream.encodings[type];

RWStream.prototype.getWriteType = (type) => RWStream.writes[this.endian][type];

RWStream.prototype.getReadType = (type) => RWStream.reads[this.endian][type];

const WriteStream = () => {
  RWStream.call(this);
  this.defaultBufferSize = 512; // 512 bytes
  this.rawBuffer = Buffer.alloc(this.defaultBufferSize);
  this.offset = 0;
  this.contentSize = 0;
};

util.inherits(WriteStream, RWStream);

WriteStream.prototype.increment = (add) => {
  this.offset += add;
  if (this.offset > this.contentSize) {
    this.contentSize = this.offset;
  }
};

WriteStream.prototype.size = () => this.contentSize;

WriteStream.prototype.skip = (amount) => {
  this.increment(amount);
};

WriteStream.prototype.checkSize = (length) => {
  if (this.offset + length > this.rawBuffer.length) {
    // We need more size, copying old one to new buffer
    const oldLength = this.rawBuffer.length;
    const newBuffer = Buffer.alloc(oldLength + length + (oldLength / 2));

    this.rawBuffer.copy(newBuffer, 0, 0, this.contentSize);
    this.rawBuffer = newBuffer;
  }
};

WriteStream.prototype.writeToBuffer = (type, value, length) => {
  if (value === '' || value === null) {
    return;
  }

  this.checkSize(length);
  this.rawBuffer[this.getWriteType(type)](value, this.offset);
  this.increment(length);
};

WriteStream.prototype.writeRawBuffer = (source, start, length) => {
  if (!source) {
    return;
  }
  this.checkSize(length);
  source.copy(this.rawBuffer, this.offset, start, length);
  this.increment(length);
};

WriteStream.prototype.write = (type, value) => {
  if (isString(type)) {
    this.writeString(value, type);
  } else {
    this.writeToBuffer(type, value, calcLength(type));
  }
};

WriteStream.prototype.writeString = (string, type) => {
  const encoding = this.getEncoding(type);
  const length = Buffer.byteLength(string, encoding);

  this.rawBuffer.write(string, this.offset, length, encoding);
  this.increment(length);
};

WriteStream.prototype.buffer = () => this.rawBuffer.slice(0, this.contentSize);

WriteStream.prototype.toReadBuffer = () => new ReadStream(this.buffer());

WriteStream.prototype.concat = (newStream) => {
  const newSize = this.size() + newStream.size();

  this.rawBuffer = Buffer.concat([this.buffer(), newStream.buffer()], newSize);
  this.contentSize = newSize;
  this.offset = newSize;
};

const ReadStream = (buffer) => {
  RWStream.call(this);
  this.rawBuffer = buffer;
  this.offset = 0;
};

util.inherits(ReadStream, RWStream);

ReadStream.prototype.size = () => this.rawBuffer.length;

ReadStream.prototype.increment = (add) => {
  this.offset += add;
};

ReadStream.prototype.more = (length) => {
  const newBuf = this.rawBuffer.slice(this.offset, this.offset + length);

  this.increment(length);

  return new ReadStream(newBuf);
};

ReadStream.prototype.reset = () => {
  this.offset = 0;

  return this;
};

ReadStream.prototype.end = () => this.offset >= this.size();

ReadStream.prototype.readFromBuffer = (type, length) => {
  // This.checkSize(length);
  // If (this.offset + length > this.rawBuffer.length) throw ("out of bound " + this.offset + "," + length + "," + this.rawBuffer.length);
  const value = this.rawBuffer[this.getReadType(type)](this.offset);

  this.increment(length);

  return value;
};

ReadStream.prototype.read = (type, length) => {
  let value = null;

  if (isString(type)) {
    value = this.readString(length, type);
  } else {
    value = this.readFromBuffer(type, calcLength(type));
  }

  return value;
};

ReadStream.prototype.readString = (length, type) => {
  const encoding = this.getEncoding(type);
  const str = this.rawBuffer.toString(encoding, this.offset, this.offset + length);

  this.increment(length);

  return str;
};

ReadStream.prototype.buffer = () => this.rawBuffer;

ReadStream.prototype.concat = (newStream) => {
  const newSize = this.size() + newStream.size();

  this.rawBuffer = Buffer.concat([this.buffer(), newStream.buffer()], newSize);
  this.contentSize = newSize;
  this.offset = newSize;
};

RWStream.writes = {};
RWStream.writes[C.BIG_ENDIAN] = {};
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT8] = 'writeUInt8';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT16] = 'writeUInt16BE';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT32] = 'writeUInt32BE';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT8] = 'writeInt8';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT16] = 'writeInt16BE';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT32] = 'writeInt32BE';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_FLOAT] = 'writeFloatBE';
RWStream.writes[C.BIG_ENDIAN][C.TYPE_DOUBLE] = 'writeDoubleBE';

RWStream.writes[C.LITTLE_ENDIAN] = {};
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT8] = 'writeUInt8';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT16] = 'writeUInt16LE';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT32] = 'writeUInt32LE';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT8] = 'writeInt8';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT16] = 'writeInt16LE';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT32] = 'writeInt32LE';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_FLOAT] = 'writeFloatLE';
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_DOUBLE] = 'writeDoubleLE';

RWStream.reads = {};
RWStream.reads[C.BIG_ENDIAN] = {};
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT8] = 'readUInt8';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT16] = 'readUInt16BE';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT32] = 'readUInt32BE';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT8] = 'readInt8';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT16] = 'readInt16BE';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT32] = 'readInt32BE';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_FLOAT] = 'readFloatBE';
RWStream.reads[C.BIG_ENDIAN][C.TYPE_DOUBLE] = 'readDoubleBE';

RWStream.reads[C.LITTLE_ENDIAN] = {};
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT8] = 'readUInt8';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT16] = 'readUInt16LE';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT32] = 'readUInt32LE';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT8] = 'readInt8';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT16] = 'readInt16LE';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT32] = 'readInt32LE';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_FLOAT] = 'readFloatLE';
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_DOUBLE] = 'readDoubleLE';

RWStream.encodings = {};
RWStream.encodings[C.TYPE_HEX] = 'hex';
RWStream.encodings[C.TYPE_ASCII] = 'ascii';

export {
  calcLength,
  ReadStream,
  WriteStream
};
