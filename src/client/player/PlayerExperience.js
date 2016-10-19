import * as soundworks from 'soundworks/client';
import * as soundworksCordova from 'soundworks-cordova/client';

import SpatSourcesHandler from './SpatSourcesHandler';
import AudioPlayer from './AudioPlayer';
import AmbisonicPlayer from './AmbisonicPlayer';
import PlayerRenderer from './PlayerRenderer';

const audioContext = soundworks.audioContext;
const client = soundworks.client;

const zoneRadius = [3, 6];
const hysteresisOffsetDist = 1;
const hysteresisOffsetTime = 2;

const viewTemplate = `
  <canvas class="background"></canvas>
  <div class="foreground background-beacon">

    <div class="section-top flex-middle">
      <p class="big">Beacon ID: <%= major %>.<%= minor %></p>
      </br>
      <p class="small"> shake to shift mode, touch to reset orientation</p>
    </div>

    <div class="section-center flex-center">
      <p class="small" id="logValues"></p>
    </div>

    <div class="section-bottom flex-middle">
      <p id="value0" class="small"><%= 'NaN' %></p>
      <p id="value1" class="small"><%= 'NaN' %></p>
      <p id="value2" class="small"><%= 'NaN' %></p>      
    </div>

  </div>
`;

// this experience plays a sound when it starts, and plays another sound when
// other clients join the experience
export default class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain, standalone, beaconUUID, audioFiles) {
    super(!standalone);
    this.standalone = standalone;

    // services
    this.platform = this.require('platform', { features: ['web-audio'] });
    if (!standalone) this.checkin = this.require('checkin', { showDialog: false });
    this.loader = this.require('loader', { files: audioFiles });
    this.motionInput = this.require('motion-input', { descriptors: ['deviceorientation', 'accelerationIncludingGravity'] });
    // beacon only work in cordova mode since it needs access right to BLE
    if (window.cordova) {
      this.beacon = this.require('beacon', { uuid: beaconUUID });
      this.beaconCallback = this.beaconCallback.bind(this);
    }

    // bind
    this.initBeacon = this.initBeacon.bind(this);

    // local attributes
    this.ambiFileId = -1;
    this.lastDistHysteresisTime = 0.0;
    this.hasLoadedOnce = false;

  }

  init() {
    // initialize the view
    this.viewTemplate = viewTemplate;
    this.viewContent = { major: this.beacon.major, minor: this.beacon.minor };
    this.viewCtor = soundworks.CanvasView;
    this.viewOptions = { preservePixelRatio: true };
    this.view = this.createView();
    this.renderer = new PlayerRenderer();
    this.view.addRenderer(this.renderer);    
  }

  start() {
    super.start();

    if (!this.hasStarted){
      this.initBeacon();
      this.init();
    }

    this.show();

    // init audio source spatializer
    let roomReverb = false;
    // this.spatSourceHandler = new SpatSourcesHandler(this.loader.buffers, roomReverb);

    // init HOA player
    this.ambisonicPlayer = new AmbisonicPlayer(roomReverb);
    this.audioPlayer = new AudioPlayer(this.loader.buffers);

    // this.ambisonicPlayer.startSource( this.ambiFileId );

    // setup motion input listener (update audio listener aim based on device orientation)
    if (this.motionInput.isAvailable('deviceorientation')) {
      this.motionInput.addListener('deviceorientation', (data) => {
        // display orientation info on screen
        document.getElementById("value0").innerHTML = Math.round(data[0]*10)/10;
        document.getElementById("value1").innerHTML = Math.round(data[1]*10)/10;
        document.getElementById("value2").innerHTML = Math.round(data[2]*10)/10;
        // set audio source position
        this.ambisonicPlayer.setListenerAim(data[0], data[1]);
      });
    }

    // // setup motion input listeners (shake to change listening mode)
    // if (this.motionInput.isAvailable('accelerationIncludingGravity')) {
    //   this.motionInput.addListener('accelerationIncludingGravity', (data) => {

    //       // get acceleration data
    //       const mag = Math.sqrt(data[0] * data[0] + data[1] * data[1] + data[2] * data[2]);

    //       // switch between spatialized mono sources / HOA playing on shaking (+ throttle inputs)
    //       if (mag > 40 && ( (audioContext.currentTime - this.lastShakeTime) > 0.5) ){
    //         // update throttle timer
    //         this.lastShakeTime = audioContext.currentTime;
    //         // switch mode
    //         if( this.audioMode == 0 ){
    //           this.audioMode = 1;
    //           this.spatSourceHandler.stop();
    //           this.ambisonicPlayer.startSource( this.ambiFileId, true, 0.0 );
    //         }
    //         else{
    //           this.audioMode = 0;
    //           this.ambisonicPlayer.stop(); 
    //           this.spatSourceHandler.startAll();
    //         }
    //       }
    //   });
    // }

    // create touch event source referring to our view
    const surface = new soundworks.TouchSurface(this.view.$el);
    // setup touch listeners (reset listener orientation on touch)
    surface.addListener('touchstart', (id, normX, normY) => {
        // reset listener orientation (azim only)
        this.ambisonicPlayer.resetListenerAim();
    });

  }

  // -------------------------------------------------------------------------------------------
  // BEACON-RELATED METHODS
  // -------------------------------------------------------------------------------------------

  initBeacon() {

    // initialize ibeacon service
    if (this.beacon) {
      // add callback, invoked whenever beacon scan is executed
      this.beacon.addListener(this.beaconCallback);
      // fake calibration
      this.beacon.txPower = -55; // in dB (see beacon service for detail)
      // set major / minor ID based on client id
      if (!this.standalone) {
        this.beacon.major = 0;
        this.beacon.minor = client.index;
        this.beacon.restartAdvertising();
      }
    }

    // INIT FAKE BEACON (for computer based debug)
    else { 
      this.beacon = {major:0, minor: client.index};
      this.beacon.rssiToDist = function(){return 1.5 + 6*Math.random()};    
      window.setInterval(() => {
        var pluginResult = { beacons : [] };
        for (let i = 0; i < 4; i++) {
          var beacon = {
            major: 0,
            minor: i,
            rssi: -45 - i * 5,
            proximity : 'fake, nearby',
          };
          pluginResult.beacons.push(beacon);
        }
        this.beaconCallback(pluginResult);
      }, 3000);
    }

  }

  beaconCallback(pluginResult) {
    // diplay beacon list on screen
    var log = 'Closeby Beacons: </br></br>';
    pluginResult.beacons.forEach((beacon) => {
      log += beacon.major + '.' + beacon.minor + ' dist: ' 
            + Math.round( this.beacon.rssiToDist(beacon.rssi)*100, 2 ) / 100 + 'm' + '</br>' +
             '(' + beacon.proximity + ')' + '</br></br>';
    });
    document.getElementById('logValues').innerHTML = log;

    // select current ambisonic file based on distance to beacon 0
    pluginResult.beacons.forEach((beacon) => {
      
      if( beacon.minor == 0 ){

        // get current zone (based on distance from beacon 0)
        let dist = this.beacon.rssiToDist(beacon.rssi);
        let newAmbiFileId = this.ambiFileId;
        let bkgColor = [0,0,0];

        if( dist <  ( zoneRadius[0] - hysteresisOffsetDist ) ){ 
          newAmbiFileId = 0;
          bkgColor = [0,0,100];
        }
        else if( dist > ( zoneRadius[0] + hysteresisOffsetDist ) && dist < ( zoneRadius[1] - hysteresisOffsetDist ) ){ 
          newAmbiFileId = 1;
          bkgColor = [100,0,0];
        }
        else if( dist > ( zoneRadius[1] + hysteresisOffsetDist ) ){ 
          newAmbiFileId = 2;
          bkgColor = [0,100,0];
        }

        // bypass hysteresis for first launch, start in zone 0
        if( !this.hasLoadedOnce ){
          this.hasLoadedOnce = true;
          newAmbiFileId = 0;
          bkgColor = [0,0,100];          
        }

        console.log(this.ambiFileId, newAmbiFileId);
        // set ambisonic file id if 1) new and 2) hysteresys
        if( (newAmbiFileId != this.ambiFileId) && 
          (audioContext.currentTime - this.lastDistHysteresisTime) > hysteresisOffsetTime ){

          // play transition sound
          let transId;
          if( this.ambiFileId == 0 && newAmbiFileId == 1 ) transId = 0;
          // if( this.ambiFileId == 1 && newAmbiFileId == 0 ) transId = 0;
          if( this.ambiFileId == 1 && newAmbiFileId == 2 ) transId = 1;
          // if( this.ambiFileId == 2 && newAmbiFileId == 1 ) transId = 1;
          if( transId !== undefined )
            this.audioPlayer.startSource(transId, 0, false);

          // update local
          this.lastDistHysteresisTime = audioContext.currentTime;
          this.ambiFileId = newAmbiFileId;

          // update player
          this.ambisonicPlayer.stop(-1, 1.0);
          this.ambisonicPlayer.startSource( this.ambiFileId, true, 1.0 );

          // update bkg color
          this.renderer.setBkgColor(bkgColor);

        }
      }

    });
  }

  // -------------------------------------------------------------------------------------------

}
