DIMSE in ES6
============

This is a library that implements dimse tcp protocol in ecmascript 6, it's still in development stage, current supported service include C-GET, C-FIND, C-STORE.

Examples

Below it's a example that fetches a mr image instance.

--------

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
            //console.log("c-get-rsp received");
          }, function(cmd) {
            this.release();
          }, function(instance){
            console.log(instance.toString());

            return C.STATUS_SUCCESS;
          }]);
        }]);
      }]);
    });

above code will output:

> Connection established
> DateSet Message [
> SpecificCharacterSet : [ISO_IR 100]
> ImageType : [ORIGINAL][PRIMARY][OTHER]
> InstanceCreationDate : Thu Feb 01 2007 00:00:00 GMT-0600 (中部标准时间)
> InstanceCreationTime : 120000.000000
> SOPClassUID : 1.2.840.10008.5.1.4.1.1.4
> SOPInstanceUID : 1.2.840.113619.2.176.2025.1499492.7040.1171286242.298
> StudyDate : Thu Feb 01 2007 00:00:00 GMT-0600 (中部标准时间)
> SeriesDate : Thu Feb 01 2007 00:00:00 GMT-0600 (中部标准时间)
> AcquisitionDate : Thu Feb 01 2007 00:00:00 GMT-0600 (中部标准时间)
> ContentDate : Thu Feb 01 2007 00:00:00 GMT-0600 (中部标准时间)
> AcquisitionDateTime : 20070101120000
> StudyTime : 120000.000000
> SeriesTime : 120000.000000
> AcquisitionTime : 120000.000000
> ContentTime : 120000.000000
> Modality : MR
> Manufacturer : GE MEDICAL SYSTEMS
> InstitutionName : 0ECJ52puWpVIjTuhnBA0um
> ReferringPhysicianName : 1
> StationName : TWINOW
> StudyDescription : Knee (R)
> SeriesDescription : Cor FSE T1
> NameOfPhysiciansReadingStudy : [ajb]
> OperatorsName : [ca]
> ManufacturerModelName : SIGNA EXCITE
> ReferencedImageSequence : [
>   ReferencedSOPClassUID : 1.2.840.10008.5.1.4.1.1.4
>   ReferencedSOPInstanceUID : 1.2.840.113619.2.176.2025.1499492.7040.1171286241.719
> ][
>   ReferencedSOPClassUID : 1.2.840.10008.5.1.4.1.1.4
>   ReferencedSOPInstanceUID : 1.2.840.113619.2.176.2025.1499492.7040.1171286241.708
> ]
> DerivationDescription : Lossless JPEG compression, selection value 1, point transform 0, compression ratio 1.6475 [Lossless JPEG compression, selection value 1, point transform 0, compression ratio 1.6475]
> DerivationCodeSequence : [
>   CodeValue : 121327
>   CodingSchemeDesignator : DCM
>   CodeMeaning : Full fidelity image, uncompressed or lossless compressed
> ]
> PatientName : KNIX
> PatientID : ozp00SjY2xG
> PatientAge : 000Y
> PatientWeight : 0
> ScanningSequence : [SE]
> SequenceVariant : [SK][OSP]
> ScanOptions : [NPW][TRF_GEMS][FILTERED_GEMS]
> MRAcquisitionType : 2D
> AngioFlag : N
> SliceThickness : 4
> RepetitionTime : 500
> EchoTime : 11.536
> InversionTime : 0
> NumberOfAverages : 0.5
> ImagingFrequency : 63.860135
> ImagedNucleus : 1H
> EchoNumbers : [1]
> MagneticFieldStrength : 1.5
> SpacingBetweenSlices : 4.5
> EchoTrainLength : 3
> PercentSampling : 57.1429
> PercentPhaseFieldOfView : 100
> PixelBandwidth : 122.07
> DeviceSerialNumber : 0000000843815bmr
> SoftwareVersions : [12][LX][MR Software release:12.0_M5_0606.b]
> ProtocolName : 324-58-2995/8
> HeartRate : 474
> CardiacNumberOfImages : 0
> TriggerWindow : 0
> ReconstructionDiameter : 150
> ReceiveCoilName : HD TRknee PA
> AcquisitionMatrix : [0][512][224][0]
> InPlanePhaseEncodingDirection : ROW
> FlipAngle : 90
> VariableFlipAngleFlag : N
> SAR : 0.0481
> PatientPosition : FFS
> StudyInstanceUID : 1.2.840.113619.2.176.2025.1499492.7391.1171285944.390
> SeriesInstanceUID : 1.2.840.113619.2.176.2025.1499492.7391.1171285944.396
> StudyID : 1
> SeriesNumber : 7
> AcquisitionNumber : 1
> InstanceNumber : 8
> ImagePositionPatient : [-137.836][-27.1054][64.118]
> ImageOrientationPatient : [0.999993][-0.0036927][0][-0][-0][-1]
> FrameOfReferenceUID : 1.2.840.113619.2.176.2025.1499492.7391.1171285944.389
> ImagesInAcquisition : 20
> SliceLocation : 27.3818512
> SamplesPerPixel : 1
> PhotometricInterpretation : MONOCHROME2
> Rows : 512
> Columns : 512
> PixelSpacing : [0.293][0.293]
> BitsAllocated : 16
> BitsStored : 16
> HighBit : 15
> PixelRepresentation : 1
> SmallestImagePixelValue : 0
> LargestImagePixelValue : 7493
> PixelPaddingValue : 0
> WindowCenter : [3746]
> WindowWidth : [7493]
> PixelData : .....