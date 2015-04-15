import {PDataTF as PDataTF, PresentationDataValueItem as PresentationDataValueItem} from './PDU'
import * as M from './Message'

export class DimseService {
  constructor(conn) {
    this.connection = conn;
    this.params = {};
    this.messages = {};
    this.counter = 0;
    this.retrieveLevel = C.QUERY_RETRIEVE_LEVEL_STUDY;
    this.contextUID = null;
    this.contextID = null;
  }

  setQueryRetrieveLevel(lvl) {
    this.retrieveLevel = lvl;
  }

  setConnection(conn) {
    this.connection = conn;
  }

  setParams(params) {
    this.params = params;
  }

  setContextId(contextId) {
    this.contextUID = contextId;
  }

  associate(callback) {
    let o = this;
    this.connection.startAssociationRequest(callback);
  }

  sendMessage(command, dataset, listener) {
    let datasetMessage = null;
    if (dataset) {
      datasetMessage = new M.DataSetMessage();
      datasetMessage.setElements(dataset);
    }
    
    this.connection.sendMessage(command, datasetMessage, listener, this);
  }

  send(message, params, callback) {
    let o = this;
    this.associate(function(ac) {
      o.sendMessage(message, params, callback);
      //this.close();
    });    
  }

  close() {
    this.connection.release();
  }
}

export class CFind extends DimseService {
  constructor(conn) {
    super(conn);
    this.setContextId(C.SOP_STUDY_ROOT_FIND);
  }

  retrieveStudies(params, callback) {
    let sendParams = Object.assign({
      0x00080052 : C.QUERY_RETRIEVE_LEVEL_STUDY,
      0x00080020 : "",
      0x00100010 : "",
      0x00080061 : "",
      0x0020000D : ""
    }, params);

    this.send(sendParams, callback);
  }

  retrieveInstances(params, callback) {
    let sendParams = Object.assign({
      0x00080052 : C.QUERY_RETRIEVE_LEVEL_IMAGE,
      0x00080020 : "",
      0x00080018 : "",
      0x00080016 : ""
    }, params);

    this.send(sendParams, callback);
  };

  retrieveHangingProtocol(params, callback) {
    this.setContextId(C.SOP_HANGING_PROTOCOL_FIND);
    params = Object.assign({
      0x00080018 : "",
      0x00720020 : "",
      0x0072000C : "",
      0x00720102 : "",
      0x00720100 : "",
      0x00720200 : ""
    }, params);//[{0x00080060 : "", 0x00200060 : ""}]

    this.send(params, callback);
  }

  send(params, callback) {
    super.send(new M.CFindRQ(), params, callback);
  }
}

export class CMove extends DimseService {
  constructor(conn, cstr) {
    super(conn);
    this.setContextId(C.SOP_STUDY_ROOT_MOVE);
    this.storeService = cstr;
    this.destination = null;
  }

  setStoreService(cstr) {
    this.storeService = cstr;
  }

  setDestination(dest) {
    this.destination = dest;
  }

  retrieveStudy(studyId, params, callback) {
    let sendParams = Object.assign({
      0x00080052 : C.QUERY_RETRIEVE_LEVEL_STUDY,
      0x00080020 : "",
      0x00100010 : "",
      0x00080061 : "",
      0x0020000D : studyId
    }, params);

    this.send(sendParams, callback);
  }

  send(params, callback) {
    let getrq = new M.CMoveRQ();
    if (this.storeService)
      getrq.setStore(this.storeService);
    if (this.destination)
      getrq.setDestination(this.destination);

    super.send(getrq, params, callback);
  }  
}

export class CGet extends DimseService {
  constructor(conn, cstr) {
    super(conn);
    this.setContextId(C.SOP_STUDY_ROOT_GET);
    this.storeService = cstr;
  }

  setStoreService(cstr) {
    this.storeService = cstr;
  }

  retrieveStudy(studyId, params, callback) {
    let sendParams = Object.assign({
      0x00080052 : C.QUERY_RETRIEVE_LEVEL_STUDY,
      0x00080020 : "",
      0x00100010 : "",
      0x00080061 : "",
      0x0020000D : studyId
    }, params);

    this.send(sendParams, callback);
  }

  retrieveInstance(instanceId, params, callback) {
    let sendParams = Object.assign({
      0x00080052 : C.QUERY_RETRIEVE_LEVEL_IMAGE,
      0x00080020 : "",
      0x00100010 : "",
      0x00080061 : "",
      0x00080018 : instanceId
    }, params);

    this.send(sendParams, callback);    
  }

  send(params, callback) {
    let getrq = new M.CGetRQ();
    if (this.storeService)
      getrq.setStore(this.storeService);

    super.send(getrq, params, callback);
  }  
}

export class CStore extends DimseService {
  constructor(conn, context) {
    super(conn);
    this.setContextId(context);
  }

  replyWith(status) {
    let msg = new M.CStoreRSP();
    msg.setStatus(status);
    return msg;
  }
}

export class MRImageStorage extends DimseService {
  constructor(conn) {
    super(conn);
    this.setContextId(C.SOP_MR_IMAGE_STORAGE);
  }
}