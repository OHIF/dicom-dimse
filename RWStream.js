

function isString(type) {
  if (type == C.TYPE_ASCII || type == C.TYPE_HEX) {
    return true;
  } else return false;
};

export function calcLength(type, value) {
  let size = NaN;
  switch (type) {
    case C.TYPE_HEX    : size = Buffer.byteLength(value, 'hex'); break;
    case C.TYPE_ASCII  : size = Buffer.byteLength(value, 'ascii'); break;
    case C.TYPE_UINT8  : size = 1; break;
    case C.TYPE_UINT16 : size = 2; break;
    case C.TYPE_UINT32 : size = 4; break;
    case C.TYPE_FLOAT  : size = 4; break;
    case C.TYPE_DOUBLE : size = 8; break;
    case C.TYPE_INT8   : size = 1; break;
    case C.TYPE_INT16  : size = 2; break;
    case C.TYPE_INT32  : size = 4; break;    
    default :break;
  }
  return size;
}

export class RWStream {
  constructor() {
    this.endian = C.BIG_ENDIAN;
  }

  setEndian(endian) {   
    this.endian = endian;
  }

  getEncoding(type) {
    return RWStream.encodings[type];
  }

  getWriteType(type) {
    return RWStream.writes[this.endian][type];
  }

  getReadType(type) {
    return RWStream.reads[this.endian][type];
  }  
}

export class WriteStream extends RWStream {
  constructor() {
    super();
    this.defaultBufferSize = 512; //512 bytes
    this.rawBuffer = new Buffer(this.defaultBufferSize);
    this.offset = 0;
    this.contentSize = 0;
  }

  increment(add) {
    this.offset += add;
    if (this.offset > this.contentSize) {
      this.contentSize = this.offset;
    }
  }

  size() {
    return this.contentSize;
  }

  skip(amount) {
    this.increment(amount);
  }

  checkSize(length) {
    if (this.offset + length > this.rawBuffer.length) {
      // we need more size, copying old one to new buffer
      let oldLength = this.rawBuffer.length, 
          newBuffer = new Buffer(oldLength + length + (oldLength / 2));
      this.rawBuffer.copy(newBuffer, 0, 0, this.contentSize);
      this.rawBuffer = newBuffer;
    }
  }

  writeToBuffer(type, value, length) {
    if (value === "" || value === null) return;
    
    this.checkSize(length);
    this.rawBuffer[this.getWriteType(type)](value, this.offset);
    this.increment(length);
  }

  write(type, value) {
    if (isString(type)) {
      this.writeString(value, type);
    } else {
      this.writeToBuffer(type, value, calcLength(type));
    }
  }

  writeString(string, type) {
    let encoding = this.getEncoding(type), length = Buffer.byteLength(string, encoding);
    this.rawBuffer.write(string, this.offset, length, encoding);
    this.increment(length);
  }

  buffer() {
    return this.rawBuffer.slice(0, this.contentSize);
  }

  concat(newStream) {
    let newSize = this.size() + newStream.size();
    this.rawBuffer = Buffer.concat([this.buffer(), newStream.buffer()], newSize);
    this.contentSize = newSize;
    this.offset = newSize;
  }
}

export class ReadStream extends RWStream {
  constructor(buffer) {
    super();
    this.rawBuffer = buffer;
    this.offset = 0;
  }

  size() {
    return this.rawBuffer.length;
  }

  increment(add) {
    this.offset += add;
  }  

  more(length) {
    let newBuf = this.rawBuffer.slice(this.offset, this.offset + length);
    this.increment(length);
    return new ReadStream(newBuf);
  }

  reset() {
    this.offset = 0;
    return this;
  }

  end() {
    return this.offset >= this.size();
  }

  readFromBuffer(type, length) {
    //this.checkSize(length);
    let value = this.rawBuffer[this.getReadType(type)](this.offset);
    this.increment(length);
    return value;
  }  

  read(type, length) {
    let value = null;
    if (isString(type)) {
      value = this.readString(length, type);
    } else {
      value = this.readFromBuffer(type, calcLength(type));
    }

    return value;
  }

  readString(length, type) {
    let encoding = this.getEncoding(type), 
        str = this.rawBuffer.toString(encoding, this.offset, this.offset + length);
    this.increment(length);
    return str;
  }  

  buffer() {
    return this.rawBuffer;
  }

  concat(newStream) {
    let newSize = this.size() + newStream.size();
    this.rawBuffer = Buffer.concat([this.buffer(), newStream.buffer()], newSize);
    this.contentSize = newSize;
    this.offset = newSize;
  }  
}

RWStream.writes = {};
RWStream.writes[C.BIG_ENDIAN] = {};
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT8] = "writeUInt8";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT16] = "writeUInt16BE";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_UINT32] = "writeUInt32BE";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT8] = "writeInt8";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT16] = "writeInt16BE";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_INT32] = "writeInt32BE";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_FLOAT] = "writeFloatBE";
RWStream.writes[C.BIG_ENDIAN][C.TYPE_DOUBLE] = "writeDoubleBE";

RWStream.writes[C.LITTLE_ENDIAN] = {};
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT8] = "writeUInt8";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT16] = "writeUInt16LE";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_UINT32] = "writeUInt32LE";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT8] = "writeInt8";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT16] = "writeInt16LE";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_INT32] = "writeInt32LE"; 
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_FLOAT] = "writeFloatLE";
RWStream.writes[C.LITTLE_ENDIAN][C.TYPE_DOUBLE] = "writeDoubleLE";

RWStream.reads = {};
RWStream.reads[C.BIG_ENDIAN] = {};
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT8] = "readUInt8";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT16] = "readUInt16BE";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_UINT32] = "readUInt32BE";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT8] = "readInt8";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT16] = "readInt16BE";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_INT32] = "readInt32BE";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_FLOAT] = "readFloatBE";
RWStream.reads[C.BIG_ENDIAN][C.TYPE_DOUBLE] = "readDoubleBE";

RWStream.reads[C.LITTLE_ENDIAN] = {};
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT8] = "readUInt8";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT16] = "readUInt16LE";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_UINT32] = "readUInt32LE";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT8] = "readInt8";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT16] = "readInt16LE";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_INT32] = "readInt32LE";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_FLOAT] = "readFloatLE";
RWStream.reads[C.LITTLE_ENDIAN][C.TYPE_DOUBLE] = "readDoubleLE";

RWStream.encodings = {};
RWStream.encodings[C.TYPE_HEX] = "hex";
RWStream.encodings[C.TYPE_ASCII] = "ascii";