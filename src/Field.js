import util from 'util';
import C from './constants.js';
import { calcLength } from './RWStream.js';

const Field = function (type, value) {
  this.type = type;
  this.value = value;
};

Field.prototype.length = function () {
  return calcLength(this.type, this.value);
};

Field.prototype.write = function (stream) {
  stream.write(this.type, this.value);
};

Field.prototype.isNumeric = function () {
  return false;
};

const BufferField = function (buffer, start, length) {
  Field.call(this, C.TYPE_BUFFER, buffer);
  this.bufferLength = length;
  this.bufferStart = start;
};

util.inherits(BufferField, Field);

BufferField.prototype.length = function () {
  return this.bufferLength;
};

BufferField.prototype.write = function (stream) {
  stream.writeRawBuffer(this.value, this.bufferStart, this.bufferLength);
};

const StringField = function (str) {
  Field.call(this, C.TYPE_ASCII, typeof str === 'string' ? str : '');
};

util.inherits(StringField, Field);

const FilledField = function (value, length) {
  Field.call(this, C.TYPE_COMPOSITE, value);
  this.fillLength = length;
};

util.inherits(FilledField, Field);

FilledField.prototype.length = function () {
  return this.fillLength;
};

FilledField.prototype.write = function (stream) {
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
    throw 'Length mismatch';
  }
};

const HexField = function (hex) {
  Field.call(this, C.TYPE_HEX, hex);
};

util.inherits(HexField, Field);

const ReservedField = function (length) {
  length = length || 1;
  Field.call(this, C.TYPE_HEX, '00'.repeat(length));
};

util.inherits(ReservedField, Field);

const UInt8Field = function (value) {
  Field.call(this, C.TYPE_UINT8, value);
};

util.inherits(UInt8Field, Field);

UInt8Field.prototype.isNumeric = function () {
  return true;
};

const UInt16Field = function (value) {
  Field.call(this, C.TYPE_UINT16, value);
};

util.inherits(UInt16Field, Field);

UInt16Field.prototype.isNumeric = function () {
  return true;
};

const UInt32Field = function (value) {
  Field.call(this, C.TYPE_UINT32, value);
};

util.inherits(UInt32Field, Field);

UInt32Field.prototype.isNumeric = function () {
  return true;
};

const Int8Field = function (value) {
  Field.call(this, C.TYPE_INT8, value);
};

util.inherits(Int8Field, Field);

Int8Field.prototype.isNumeric = function () {
  return true;
};

const Int16Field = function (value) {
  Field.call(this, C.TYPE_INT16, value);
};

util.inherits(Int16Field, Field);

Int16Field.prototype.isNumeric = function () {
  return true;
};

const Int32Field = function (value) {
  Field.call(this, C.TYPE_INT32, value);
};

util.inherits(Int32Field, Field);

Int32Field.prototype.isNumeric = function () {
  return true;
};

const FloatField = function (value) {
  Field.call(this, C.TYPE_FLOAT, value);
};

util.inherits(FloatField, Field);

FloatField.prototype.isNumeric = function () {
  return true;
};

const DoubleField = function (value) {
  Field.call(this, C.TYPE_DOUBLE, value);
};

util.inherits(DoubleField, Field);

DoubleField.prototype.isNumeric = function () {
  return true;
};

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
  DoubleField
};
