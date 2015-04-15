require("./constants.js");
require("./elements_data.js");

require("babel/register");
import Connection from './Connection';
import * as S from './Services';

var HOST = 'localhost';
var PORT = 9000;

var client = new Connection(HOST, PORT, {
    hostAE : "DCM4CHEE"
});
client.connect(function(){
  var cfind = new S.CFind(), cget = new S.CGet(), mr = new S.CStore(null, C.SOP_MR_IMAGE_STORAGE);
  cget.setStoreService(mr);
  //cget.setDestination("OHIFDCM");

  this.addService(cfind);
  this.addService(cget);
  this.addService(mr);

  let studyIds = [];
  cfind.retrieveStudies({}, [function(result){
    //console.log(result.toString());
    studyIds.push(result.getValue(0x0020000D));
  }, function() {
    let instances = [];
    cfind.retrieveInstances({0x0020000D : studyIds[0]}, [function(result){
      instances.push(result.getValue(0x00080018));
    }, function(){
      cget.retrieveInstance(instances[0], {}, [function(result){
        //console.log("instan");
      }, function(cmd) {
        this.release();
      }, function(instance){
        console.log(instance.toString());

        return C.STATUS_SUCCESS;
      }]);
    }]);

    /*cget.retrieveInstance(studyIds[0], {}, [function(result){
      console.log(result);
    }, function(cmd) {
      this.release();
    }, function(instance){
      console.log("received instance");
      let tags = instance.tags();
      for (let tag of tags) {
        //console.log(instance.key(tag), instance.getValue(tag));
      }
      return C.STATUS_SUCCESS;
    }]);*/
  }]);
});