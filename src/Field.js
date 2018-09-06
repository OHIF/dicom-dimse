import util from 'util';
import C from './constants.js';
import { calcLength } from './RWStream.js';

const Field = (type, value) => {
  this.type = type;
  this.value = value;
};

Field.prototype.length = () => calcLength(this.type, this.value);

Field.prototype.write = (stream) => {
  stream.write(this.type, this.value);
};

Field.prototype.isNumeric = () => false;

const BufferField = (buffer, start, length) => {
  Field.call(this, C.TYPE_BUFFER, buffer);
  this.bufferLength = length;
  this.bufferStart = start;
};

util.inherits(BufferField, Field);

BufferField.prototype.length = () => this.bufferLength;

BufferField.prototype.write = (stream) => {
  stream.writeRawBuffer(this.value, this.bufferStart, this.bufferLength);
};

const StringField = (str) => {
  Field.call(this, C.TYPE_ASCII, typeof str === 'string' ? str : '');
};

util.inherits(StringField, Field);

const FilledField = (value, length) => {
  Field.call(this, C.TYPE_COMPOSITE, value);
  this.fillLength = length;
};

util.inherits(FilledField, Field);

FilledField.prototype.length = () => this.fillLength;

FilledField.prototype.write = (stream) => {
  const len = this.value.length;

  if (len < this.fillLength && len >= 0) {
    if (len > 0) {
      stream.write(C.TYPE_ASCII, this.value);
    }
    const zeroLength = this.fillLength - len;

    stream.write(C.TYPE_HEX, '20'.repeat(zeroLength));
  } else if (len == this.fillLength) {
    stream.write(C.TYPE_ASCII, this.value);
  } else {
    throw new Error('Length mismatch');
  }
};

const HexField = (hex) => {
  Field.call(this, C.TYPE_HEX, hex);
};

util.inherits(HexField, Field);

const ReservedField = (length) => {
  length = length || 1;
  Field.call(this, C.TYPE_HEX, '00'.repeat(length));
};

util.inherits(ReservedField, Field);

const UInt8Field = (value) => {
  Field.call(this, C.TYPE_UINT8, value);
};

util.inherits(UInt8Field, Field);

UInt8Field.prototype.isNumeric = () => true;

const UInt16Field = (value) => {
  Field.call(this, C.TYPE_UINT16, value);
};

util.inherits(UInt16Field, Field);

UInt16Field.prototype.isNumeric = () => true;

const UInt32Field = (value) => {
  Field.call(this, C.TYPE_UINT32, value);
};

util.inherits(UInt32Field, Field);

UInt32Field.prototype.isNumeric = () => true;

const Int8Field = (value) => {
  Field.call(this, C.TYPE_INT8, value);
};

util.inherits(Int8Field, Field);

Int8Field.prototype.isNumeric = () => true;

const Int16Field = (value) => {
  Field.call(this, C.TYPE_INT16, value);
};

util.inherits(Int16Field, Field);

Int16Field.prototype.isNumeric = () => true;

const Int32Field = (value) => {
  Field.call(this, C.TYPE_INT32, value);
};

util.inherits(Int32Field, Field);

Int32Field.prototype.isNumeric = () => true;

const FloatField = (value) => {
  Field.call(this, C.TYPE_FLOAT, value);
};

util.inherits(FloatField, Field);

FloatField.prototype.isNumeric = () => true;

const DoubleField = (value) => {
  Field.call(this, C.TYPE_DOUBLE, value);
};

util.inherits(DoubleField, Field);

DoubleField.prototype.isNumeric = () => true;

const OtherDoubleString = () => {};
const OtherFloatString = () => {};

export {
  BufferField,
  StringField,
  FilledField,
  HexField,
  ReservedField,
  UInt8Field,
  UInt16Field,
  UInt32Field,
  Int8Field,
  Int16Field,
  Int32Field,
  FloatField,
  DoubleField,
  OtherDoubleString,
  OtherFloatString
};
