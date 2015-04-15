import * as F from './Field';

function paddingLeft(paddingValue, string) {
   return String(paddingValue + string).slice(-paddingValue.length);
};

function rtrim(str) {
  return str.replace(/\s*$/g, '');
}

function ltrim(str) {
  return str.replace(/^\s*/g, '');
}

function fieldsLength(fields) {
  let length = 0;
  for (let field of fields) {
    length += field.length();
  }    
  return length;
};

class Tag {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return "(" + paddingLeft("0000", this.group().toString(16)) + "," + 
           paddingLeft("0000", this.element().toString(16)) + ")";
  }

  is(t) {
    return this.value == t;
  }

  group() {
    return this.value >>> 16;
  }

  element() {
    return this.value & 0xffff;
  }
}

function tagFromNumbers(group, element) {
  return new Tag(((group << 16) | element) >>> 0);
}

function readTag(stream) {
  let group = stream.read(C.TYPE_UINT16), 
      element = stream.read(C.TYPE_UINT16);

  let tag = tagFromNumbers(group, element);
  return tag;
}

export function parseElements(stream, syntax) {
  let pairs = {};
  stream.reset();
  while (!stream.end()) {
    let elem = new DataElement();
    elem.setSyntax(syntax);
    elem.readBytes(stream);
    pairs[elem.tag.value] = elem;
  }
  return pairs;
}

export class ValueRepresentation {
  constructor(type) {
    this.type = type;
    this.multi = false;
  }

  read(stream, length, syntax) {
    if (this.fixed && this.maxLength) {
      if (!length)
        return this.defaultValue;
      if (this.maxLength != length)
        throw "Invalid length for fixed length tag, vr " + this.type + ", length " + this.maxLength + " != " + length;
    }
    return this.readBytes(stream, length, syntax);
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_ASCII, length);
  }

  readNullPaddedString(stream, length) {
    if (!length) return "";

    let str = stream.read(C.TYPE_ASCII, length - 1);
    if (stream.read(C.TYPE_UINT8) != 0) {
      stream.increment(-1);
      str += stream.read(C.TYPE_ASCII, 1);
    }    
    return str;
  }

  getFields(fields) {
    let valid = true;
    if (this.checkLength) {
      valid = this.checkLength(fields);
    } else if (this.maxCharLength) {
      let check = this.maxCharLength, length = 0;
      for (let field of fields) {
        if (typeof field.value == 'string')
          length += field.value.length;
      }
      valid = length <= check; 
    } else if (this.maxLength) {
      let check = this.maxLength, length = fieldsLength(fields);
      valid = length <= check;
    }
    if (!valid)
      throw "Value exceeds max length";

    //check for odd
    let length = fieldsLength(fields);
    if (length & 1) {
      fields.push(new F.HexField(this.padByte));
    }

    for (let i = 0;i < fields.length;i++) {
      if (fields[i].isNumeric() && (fields[i].value === "" || fields[i].value === null)) {
        fields[i] = new F.StringField("");
      }
    }

    return fields;
  }
}

export class ApplicationEntity extends ValueRepresentation {
  constructor() {
    super("AE");
    this.maxLength = 16;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_ASCII, length).trim();
  }  

  getFields(value) {
    return super.getFields([new F.FilledField(value, 16)]);
  }
}

export class CodeString extends ValueRepresentation {
  constructor() {
    super("CS");
    this.maxLength = 16;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return str.trim();    
  }

  getFields(value) {
    return super.getFields([new F.FilledField(value, 16)]);
  }
}

export class AgeString extends ValueRepresentation {
  constructor() {
    super("AS");
    this.maxLength = 4;
    this.padByte = "20";
    this.fixed = true;
    this.defaultValue = "";
  }

  getFields(value) {
    let str = "";
    if (value.days) {
      str = paddingLeft("000" + value.days) + "D";
    } else if (value.weeks) {
      str = paddingLeft("000" + value.weeks) + "W";
    } else if (value.months) {
      str = paddingLeft("000" + value.months) + "M";
    } else if (value.years) {
      str = paddingLeft("000" + value.years) + "Y";
    } else {
      throw "Invalid age string";
    }
    return super.getFields([new F.StringField(str)]);
  }
}

export class AttributeTag extends ValueRepresentation {
  constructor() {
    super("AT");
    this.maxLength = 4;
    this.padByte = "00";
    this.fixed = true;
  }

  readBytes(stream, length) {
    let group = stream.read(C.TYPE_UINT16), element = stream.read(C.TYPE_UINT16);
    return tagFromNumbers(group, element);
  }

  getFields(value) {
    return super.getFields([new F.UInt16Field(value.group()), new F.UInt16Field(value.element())]);
  }
}

export class DateValue extends ValueRepresentation {
  constructor() {
    super("DA");
    this.maxLength = 8;
    this.padByte = "20";
    this.fixed = true;
    this.defaultValue = "";
  }

  readBytes(stream, length) {
    let datestr = stream.read(C.TYPE_ASCII, 8);

    let year = parseInt(datestr.substring(0,4)), 
        month = parseInt(datestr.substring(4,6)), 
        day = parseInt(datestr.substring(6,8));
    return new Date(year, month, day);
  }

  getFields(date) {
    let str = null;
    if (typeof date == 'object') {
      let year = date.getFullYear(), month = paddingLeft("00", date.getMonth()), day = paddingLeft("00", date.getDate());
      str = year + month + day;
    } else {
      str = date;
    }

    return super.getFields([new F.StringField(str)]);
  }
}

export class DecimalString extends ValueRepresentation {
  constructor() {
    super("DS");
    this.maxLength = 16;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return str.trim();
  }

  getFields(value) {
    return super.getFields([new F.StringField(value.toExponential())]);
  }
}

export class DateTime extends ValueRepresentation {
  constructor() {
    super("DT");
    this.maxLength = 26;
    this.padByte = "20";
  }

  getFields(value) {
    let year = date.getUTCFullYear(), month = paddingLeft("00", date.getUTCMonth()), 
        day = paddingLeft("00", date.getUTCDate()), hour = paddingLeft("00", date.getUTCHours()),
        minute = paddingLeft("00", date.getUTCMinutes()), second = paddingLeft("00", date.getUTCSeconds()),
        millisecond = paddingLeft("000", date.getUTCMilliseconds());

    return super.getFields([new F.StringField(year + month + day + hour + minute + second + "." + millisecond + "+0000")]);
  }
}

export class FloatingPointSingle extends ValueRepresentation {
  constructor() {
    super("FL");
    this.maxLength = 4;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0.0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_FLOAT);
  }

  getFields(value) {
    return super.getFields([new F.FloatField(value)]);
  }
}

export class FloatingPointDouble extends ValueRepresentation {
  constructor() {
    super("FD");
    this.maxLength = 8;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0.0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_DOUBLE);
  }  

  getFields(value) {
    return super.getFields([new F.DoubleField(value)]);
  }
}

export class IntegerString extends ValueRepresentation {
  constructor() {
    super("IS");
    this.maxLength = 12;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return str.trim();
  }

  getFields(value) {
    return super.getFields([new F.StringField(value.toString())]);
  }
}

export class LongString extends ValueRepresentation {
  constructor() {
    super("LO");
    this.maxCharLength = 64;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return str.trim();
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class LongText extends ValueRepresentation {
  constructor() {
    super("LT");
    this.maxCharLength = 10240;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return rtrim(str);
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class PersonName extends ValueRepresentation {
  constructor() {
    super("PN");
    this.maxLength = null;
    this.padByte = "20";
  }

  checkLength(field) {
    let cmps = field[0].value.split(/\^/);
    for (let cmp of cmps) {
      if (cmp.length > 64) return false;
    }
    return true;
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return rtrim(str);
  }

  getFields(value) {
    let str = null;
    if (typeof value == 'string') {
      str = value;
    } else {
      let fName = value.family || "", gName = value.given || "", 
          middle = value.middle || "", prefix = value.prefix || "", suffix = value.suffix || "";

      str = [fName, gName, middle, prefix, suffix].join("^");      
    }

    return super.getFields([new F.StringField(str)]);
  }
}

export class ShortString extends ValueRepresentation {
  constructor() {
    super("SH");
    this.maxCharLength = 16;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return str.trim();
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class SignedLong extends ValueRepresentation {
  constructor() {
    super("SL");
    this.maxLength = 4;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_INT32);
  }

  getFields(value) {
    return super.getFields([new F.Int32Field(value)]);
  }
}

export class SequenceOfItems extends ValueRepresentation {
  constructor() {
    super("SQ");
    this.maxLength = null;
    this.padByte = "00";
  }

  readBytes(stream, sqlength, syntax) {
    if (sqlength == 0x0) {
      return []; //contains no dataset
    } else {
      let undefLength = sqlength == 0xffffffff, elements = [], read = 0;

      while (true) {
        let tag = readTag(stream), length = null;
        read += 4;

        if (tag.is(0xfffee0dd)) {
          stream.read(C.TYPE_UINT32)
          break;
        } else if (!undefLength && (read == sqlength)) {
          break;
        } else if (tag.is(0xfffee000)) {
          length = stream.read(C.TYPE_UINT32);
          read += 4;
          let itemStream = null, toRead = 0, undef = length == 0xffffffff;

          if (undef) {
            let stack = 0;
            while (1) {
              let g = stream.read(C.TYPE_UINT16);
              if (g == 0xfffe) {
                let ge = stream.read(C.TYPE_UINT16);
                if (ge == 0xe00d) {
                  stack--;
                  if (stack < 0) {
                    stream.increment(4);
                    read += 8;
                    break;
                  } else {
                    toRead += 4;
                  }
                } else if (ge == 0xe000) {
                  stack++;
                  toRead += 4;
                } else {
                  toRead += 2;
                  stream.increment(-2);
                }
              } else {
                toRead += 2;
              }
            }
          } else {
            toRead = length;
          }

          if (toRead) {
            stream.increment(undef ? (-toRead-8) : -toRead);
            itemStream = stream.more(toRead);//parseElements
            read += toRead;
            if (undef)
              stream.increment(8);

            elements.push(parseElements(itemStream, syntax));
          }
        }
      }
      return elements;
    }
  }

  getFields(value, syntax) {
    let fields = [];
    for (let message of value) {
      fields.push(new F.UInt16Field(0xfffe));
      fields.push(new F.UInt16Field(0xe000));
      fields.push(new F.UInt32Field(0xffffffff));

      for (let element of message) {
        element.setSyntax(syntax);
        fields = fields.concat(element.getFields());
      }

      fields.push(new F.UInt16Field(0xfffe));
      fields.push(new F.UInt16Field(0xe00d));
      fields.push(new F.UInt32Field(0x00000000));
    }
    fields.push(new F.UInt16Field(0xfffe));
    fields.push(new F.UInt16Field(0xe0dd));
    fields.push(new F.UInt32Field(0x00000000));    

    return super.getFields(fields);
  }
}

export class SignedShort extends ValueRepresentation {
  constructor() {
    super("SS");
    this.maxLength = 2;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_INT16);
  }

  getFields(value) {
    return super.getFields([new F.Int16Field(value)]);
  }
}

export class ShortText extends ValueRepresentation {
  constructor() {
    super("ST");
    this.maxCharLength = 1024;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    let str = this.readNullPaddedString(stream, length);
    return rtrim(str);
  }

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class TimeValue extends ValueRepresentation {
  constructor() {
    super("TM");
    this.maxLength = 14;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    return rtrim(stream.read(C.TYPE_ASCII, length));
  }  

  getFields(date) {
    let hour = paddingLeft("00", date.getHours()),
        minute = paddingLeft("00", date.getMinutes()), second = paddingLeft("00", date.getSeconds()),
        millisecond = paddingLeft("000", date.getMilliseconds());
    return super.getFields([new F.StringField(hour + minute + second + "." + millisecond)]);
  }
}

export class UnlimitedCharacters extends ValueRepresentation {
  constructor() {
    super("UC");
    this.maxLength = null;
    this.multi = true;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    return rtrim(stream.read(C.TYPE_ASCII, length));
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class UnlimitedText extends ValueRepresentation {
  constructor() {
    super("UT");
    this.maxLength = null;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    return this.readNullPaddedString(stream, length);
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class UnsignedShort extends ValueRepresentation {
  constructor() {
    super("US");
    this.maxLength = 2;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_UINT16);
  }

  getFields(value) {
    return super.getFields([new F.UInt16Field(value)]);
  }
}

export class UnsignedLong extends ValueRepresentation {
  constructor() {
    super("UL");
    this.maxLength = 4;
    this.padByte = "00";
    this.fixed = true;
    this.defaultValue = 0;
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_UINT32);
  }  

  getFields(value) {
    return super.getFields([new F.UInt32Field(value)]);
  }
}

export class UniqueIdentifier extends ValueRepresentation {
  constructor() {
    super("UI");
    this.maxLength = 64;
    this.padByte = "00";
  }

  readBytes(stream, length) {
    return this.readNullPaddedString(stream, length);
  }   

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class UniversalResource extends ValueRepresentation {
  constructor() {
    super("UR");
    this.maxLength = null;
    this.padByte = "20";
  }

  readBytes(stream, length) {
    return rtrim(stream.read(C.TYPE_ASCII, length));
  }

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class UnknownValue extends ValueRepresentation {
  constructor() {
    super("UN");
    this.maxLength = null;
    this.padByte = "00";
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_ASCII, length);
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }
}

export class OtherWordString extends ValueRepresentation {
  constructor() {
    super("OW");
    this.maxLength = null;
    this.padByte = "00";
  }

  readBytes(stream, length) {
    return stream.read(C.TYPE_ASCII, length);
  }  

  getFields(value) {
    return super.getFields([new F.StringField(value)]);
  }  
}

export function elementByType(type, value, syntax) {
  let elem = null, nk = DicomElements.dicomNDict[type];
  if (nk) {
    if (nk.vr == 'SQ') {
      let sq = [];
      for (let el of value) {
        let values = [];
        for (var tag in el) {
          values.push(elementByType(tag, el[tag], syntax));
        }
        sq.push(values);
      }
      elem = new DataElement(type, nk.vr, nk.vm, sq, false, syntax);
    } else {
      elem = new DataElement(type, nk.vr, nk.vm, value, false, syntax);
    }
  } else {
    throw "Unrecognized element type";
  }
  return elem;
}

export function elementDataByTag(tag) {
  let nk = DicomElements.dicomNDict[tag];
  if (nk) {
    return nk;
  }
  throw ("Unrecognized tag " + (tag >>> 0).toString(16));
}

export function elementKeywordByTag(tag) {
  let nk = elementDataByTag(tag);
  return nk.keyword;
}

export function vrByType(type) {
  let vr = null;
  if (type == "AE") vr = new ApplicationEntity();
  else if (type == "AS") vr = new AgeString();
  else if (type == "AT") vr = new AttributeTag();
  else if (type == "CS") vr = new CodeString();
  else if (type == "DA") vr = new DateValue();
  else if (type == "DS") vr = new DecimalString();
  else if (type == "DT") vr = new DateTime();
  else if (type == "FL") vr = new FloatingPointSingle();
  else if (type == "FD") vr = new FloatingPointDouble();
  else if (type == "IS") vr = new IntegerString();
  else if (type == "LO") vr = new LongString();
  else if (type == "LT") vr = new LongText();
  else if (type == "OB") vr = new OtherByteString();
  else if (type == "OD") vr = new OtherDoubleString();
  else if (type == "OF") vr = new OtherFloatString();
  else if (type == "OW") vr = new OtherWordString();
  else if (type == "PN") vr = new PersonName();
  else if (type == "SH") vr = new ShortString();
  else if (type == "SL") vr = new SignedLong();
  else if (type == "SQ") vr = new SequenceOfItems();
  else if (type == "SS") vr = new SignedShort();
  else if (type == "ST") vr = new ShortText();
  else if (type == "TM") vr = new TimeValue();
  else if (type == "UC") vr = new UnlimitedCharacters();
  else if (type == "UI") vr = new UniqueIdentifier();
  else if (type == "UL") vr = new UnsignedLong();
  else if (type == "UN") vr = new UnknownValue();
  else if (type == "UR") vr = new UniversalResource();
  else if (type == "US") vr = new UnsignedShort();
  else if (type == "UT") vr = new UnlimitedText();
  else throw "Invalid vr type " + type;

  return vr;
}

export function readElements(stream, syntax) {
  if (stream.end()) return false;

  let oldEndian = stream.endian;
  stream.setEndian(this.endian);

  let group = stream.read(C.TYPE_UINT16), 
      element = stream.read(C.TYPE_UINT16),
      tag = new Tag((group << 16) | element),
      length = stream.read(C.TYPE_UINT32);
  console.log(tag.toString(), length);
  stream.setEndian(oldEndian);
}

let explicitVRList = ["OB", "OW", "OF", "SQ", "UC", "UR", "UT", "UN"], 
    binaryVRs = ["FL", "FD", "SL", "SS", "UL", "US"];

export class DataElement {
  constructor(tag, vr, vm, value, vvr, syntax) {
    this.vr = vr ? vrByType(vr) : null;
    this.tag = !vvr ? new Tag(tag) : tag;
    this.value = value;
    this.vm = vm;
    this.vvr = vvr ? true : false;
    this.setSyntax(syntax ? syntax : C.IMPLICIT_LITTLE_ENDIAN);
  }

  setSyntax(syn) {
    this.syntax = syn;
    this.implicit = this.syntax == C.IMPLICIT_LITTLE_ENDIAN ? true : false;
    this.endian = (this.syntax == C.IMPLICIT_LITTLE_ENDIAN || this.syntax == C.EXPLICIT_LITTLE_ENDIAN) ? C.LITTLE_ENDIAN : C.BIG_ENDIAN;
  }

  getValue() {
    if (!this.singleValue() && !this.isBinaryNumber()) {
      return this.value.split(String.fromCharCode(0x5c));
    } else {
      return this.value;
    }
  }

  singleValue() {
    return this.vm == C.VM_SINGLE ? true : false;
  }

  getVMNum() {
    let num = 1;
    switch(this.vm) {
      case C.VM_SINGLE : num = 1; break;
      case C.VM_TWO : num = 2; break;
      case C.VM_THREE : num = 3; break;
      case C.VM_FOUR : num = 4; break;
      case C.VM_16 : num = 16; break;
      default : break;
    }
    return num;
  }

  isBinaryNumber() {
    return binaryVRs.indexOf(this.vr.type) != -1;
  }

  length(fields) {
    //let fields = this.vr.getFields(this.value);
    return fieldsLength(fields);
  }

  readBytes(stream) {
    let oldEndian = stream.endian;
    stream.setEndian(this.endian);

    let group = stream.read(C.TYPE_UINT16), 
        element = stream.read(C.TYPE_UINT16),
        tag = tagFromNumbers(group, element);

    let length = null, vr = null, edata = elementDataByTag(tag.value),
        vm = edata.vm;

    if (this.implicit) {
      length = stream.read(C.TYPE_UINT32);
      vr = edata.vr;
    } else {
      vr = stream.read(C.TYPE_ASCII, 2);
      if (explicitVRList.indexOf(vr) != -1) {
        stream.increment(2);
        length = stream.read(C.TYPE_UINT32);
      } else {
        length = stream.read(C.TYPE_UINT16);
      }
    }

    this.vr = vrByType(vr);
    this.tag = tag;
    this.vm = vm;
    if (this.isBinaryNumber() && length > this.vr.maxLength) {
      let times = length / this.vr.maxLength, i = 0;
      this.value = [];
      while (i++ < times) {
        this.value.push(this.vr.read(stream, this.vr.maxLength));
      }
    } else {
      this.value = this.vr.read(stream, length, this.syntax);
    }

    stream.setEndian(oldEndian);
  }

  write(stream) {
    let oldEndian = stream.endian;
    stream.setEndian(this.endian);

    let fields = this.getFields();
    for (let field of fields) {
      field.write(stream);
    }

    stream.setEndian(oldEndian);
  }

  getFields() {
    let fields = [new F.UInt16Field(this.tag.group()), new F.UInt16Field(this.tag.element())], 
        valueFields = this.vr.getFields(this.value, this.syntax), valueLength = fieldsLength(valueFields), vrType = this.vr.type;    

    if (vrType == "SQ") {
      valueLength = 0xffffffff;
    }

    if (this.implicit) {
      fields.push(new F.UInt32Field(valueLength));
    } else {
      if (explicitVRList.indexOf(vrType) != -1) {
        fields.push(new F.StringField(vrType), new F.ReservedField(2), new F.UInt32Field(valueLength));
      } else {
        fields.push(new F.StringField(vrType), new F.UInt16Field(valueLength));
      } 
    }

    fields = fields.concat(valueFields);
    return fields;
  }
}

