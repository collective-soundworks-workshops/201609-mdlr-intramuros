import * as soundworks from 'soundworks/client';
import * as soundworksCordova from 'soundworks-cordova/client';

const audioContext = soundworks.audioContext;
const client = soundworks.client;

const viewTemplate = `
  <canvas class="background"></canvas>
  <div class="foreground background-beacon">
    <div class="section-top flex-middle">
      <p class="big">Beacon ID: <%= major %>.<%= minor %></p>
    </div>
    <div class="section-center flex-center">
      <p class="small" id="logValues"></p>
    </div>
    <div class="section-bottom flex-middle"></div>
  </div>
`;

// this experience plays a sound when it starts, and plays another sound when
// other clients join the experience
export default class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain, standalone, beaconUUID) {
    super(!standalone);
    this.standalone = standalone;

    this.platform = this.require('platform', { features: ['web-audio'] });
    if (!standalone) this.checkin = this.require('checkin', { showDialog: false });

    // beacon only work in cordova mode since it needs access right to BLE
    if (window.cordova) {
      this.beacon = this.require('beacon', { uuid: beaconUUID });
      this.beaconCallback = this.beaconCallback.bind(this);
    }    
  }

  init() {
    // initialize the view
    this.viewTemplate = viewTemplate;
    this.viewContent = { major: this.beacon.major, minor: this.beacon.minor };
    this.viewCtor = soundworks.CanvasView;
    this.viewOptions = { preservePixelRatio: true };
    this.view = this.createView();
  }

  start() {
    super.start(); // don't forget this

    if (!this.hasStarted)
      this.initBeacon();
      this.init();

    this.show();

  }

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
      this.beacon.rssiToDist = function(){return 3 + 1*Math.random()};    
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
      }, 1000);
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
  }  
}
