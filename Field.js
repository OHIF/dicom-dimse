import { calcLength as calcLength } from './RWStream';

export class Field {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }

  length() {
    return calcLength(this.type, this.value);
  }

  write(stream) {
    stream.write(this.type, this.value);
  }

  isNumeric() {
    return false;
  }
}

export class StringField extends Field {
  constructor(str) {
    super(C.TYPE_ASCII, str);
  }
}

export class FilledField extends Field {
  constructor(value, length) {
    super(C.TYPE_COMPOSITE, value);
    this.fillLength = length;
  }

  length() {
    return this.fillLength;
  }

  write(stream) {
    let len = this.value.length;
    if (len < this.fillLength && len >= 0) {
      if (len > 0)
        stream.write(C.TYPE_ASCII, this.value);
      let zeroLength = this.fillLength - len;
      stream.write(C.TYPE_HEX, "20".repeat(zeroLength));
    } else if (len == this.fillLength) {
      stream.write(C.TYPE_ASCII, this.value);
    } else {
      throw "Length mismatch";
    }    
  }
}

export class HexField extends Field {
  constructor(hex) {
    super(C.TYPE_HEX, hex);
  }
}

export class ReservedField extends Field {
  constructor(length) {
    length = length || 1;
    super(C.TYPE_HEX, "00".repeat(length));
  }
}

export class UInt8Field extends Field {
  constructor(value) {
    super(C.TYPE_UINT8, value);
  }

  isNumeric() {
    return true;
  }  
}

export class UInt16Field extends Field {
  constructor(value) {
    super(C.TYPE_UINT16, value);
  }

  isNumeric() {
    return true;
  }   
}

export class UInt32Field extends Field {
  constructor(value) {
    super(C.TYPE_UINT32, value);
  }

  isNumeric() {
    return true;
  }   
}

export class Int8Field extends Field {
  constructor(value) {
    super(C.TYPE_INT8, value);
  }

  isNumeric() {
    return true;
  } 
}

export class Int16Field extends Field {
  constructor(value) {
    super(C.TYPE_INT16, value);
  }

  isNumeric() {
    return true;
  }   
}

export class Int32Field extends Field {
  constructor(value) {
    super(C.TYPE_INT32, value);
  }

  isNumeric() {
    return true;
  }   
}

export class FloatField extends Field {
  constructor(value) {
    super(C.TYPE_FLOAT, value);
  }

  isNumeric() {
    return true;
  }   
}

export class DoubleField extends Field {
  constructor(value) {
    super(C.TYPE_DOUBLE, value);
  }

  isNumeric() {
    return true;
  }   
}