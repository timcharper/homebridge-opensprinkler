var Accessory, Service, Characteristic, UUIDGen;
const request = require('request');
const url = require('url');

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-opensprinkler", "OpenSprinkler", SprinklerPlatform);
};

class OpenSprinklerApi {
  constructor(log, config) {
    this.log = log
    this.baseUrl = "http://" + config.host
    this.passwordMd5 = config.password.md5
    this.statusUrl = this.urlFor("/ja")
  }

  urlFor(path, params) {
    let url = this.baseUrl + path + "?pw=" + this.passwordMd5
    if (params)
      url = url + "&" + params
    return url
  }

  getStatus(callback) {
    let self = this
    request({url: this.statusUrl}, (error, response, body) => {
      if (error != null) {
        self.log("ERROR getting status!")
        self.log(error)
        callback(error)
      } else {
        let json = JSON.parse(body)
        callback(null, json)
      }
    })
  }

  setRainDelay(rd, callback) {
    request({url: this.urlFor("/cv", "rd=" + rd)}, (error, response, body) => {
        if (error != null) {
          self.log("ERROR setting rain delay")
          self.log(error)
          callback(error);
        } else {
          let json = JSON.parse(body)
          if (json.result == 1) {
            callback();
          } else {
            callback("result was " + body);
          }
        }
      }
    )
  }

  setValve(sid, enable, time, callback) {
    let params = "sid=" + sid
    if (enable)
      params = params + "&en=1&t=" + time
    else
      params = params + "&en=0"

    request({url: this.urlFor("/cm", params)}, (error, response, body) => {
      if (error != null) {
        self.log("ERROR turning valve " + self.name + " on!")
        self.log(error)
        callback(error);
      } else {
        let json = JSON.parse(body)
        if (json.result == 1) {
          callback();
        } else {
          callback("result was " + body);
        }
      }
    })
  }
}

class SprinklerPlatform {
  constructor(log, config, api) {
    let self = this
    this.log = log;
    this.name = "Test valve"
    this.config = config;
    this.api = api;
    this.openSprinklerApi = new OpenSprinklerApi(log, config)
    this.pollIntervalMs = config.pollIntervalMs || 5000;

    this.accessories = function (next) {
      this.openSprinklerApi.getStatus((error, json) => {
        if (error != null) {
          next([]);
        } else {
          let names = json.stations.snames
          self.log(names)
          self.valves = config.valves.map(function (valveIndex) {
            let sprinkler = new SprinklerStation(log, config, names[valveIndex], valveIndex, self.openSprinklerApi)
            sprinkler.updateState(json.settings.ps[valveIndex]);
            return(sprinkler)
          });
          self.rainDelay = new RainDelay(log, config, self.openSprinklerApi)
          self.poll();

          next(self.valves.concat([self.rainDelay]));
        }
      })
    }
  }

  poll() {
    let self = this
    setTimeout(function() {
      self.openSprinklerApi.getStatus((error, json) => {
        self.poll()
        self.log("poll response")
        if (error == null) {
          self.valves.forEach(function(valve) {
            valve.updateState(json.settings.ps[valve.sid]);
          });
          self.rainDelay.updateState(json.settings.rd);
        }
      })
    }, self.pollIntervalMs)
  }
}

class RainDelay {
  constructor(log, config, openSprinklerApi) {
    this.log = log;
    this.openSprinklerApi = openSprinklerApi
    this.rainDelayHoursOnEnable = config.rainDelayHoursOnEnable || 24;
    this.name = "Rain Delay";
    this.currentState = false;
  }

  updateState(rd) {
    this.log("rain delay = " + rd);
    this.currentState = rd != 0;

    if (this.switchService) {
      this.switchService.getCharacteristic(Characteristic.On).
        updateValue(this.currentState);
    }
  }

  getServices(next) {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "OpenSprinkler")
      .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-raindelay");
    
    this.switchService = new Service.Switch(this.name);

    this.switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchOnCharacteristic.bind(this))
      .on('set', this.setSwitchOnCharacteristic.bind(this));
    
    this.informationService = informationService;
    return [informationService, this.switchService];
  }
  
  getSwitchOnCharacteristic(next) {
    next(null, this.currentState);
  }

  setSwitchOnCharacteristic(on, next) {
    let self = this
    this.log("setSprinklerOnCharacteristic " + on)
    if (on)
      this.openSprinklerApi.setRainDelay(self.rainDelayHoursOnEnable, next)
    else
      this.openSprinklerApi.setRainDelay(0, next)
  }
}

class SprinklerStation {
  constructor (log, config, name, sid, openSprinklerApi) {
    this.log = log;
    this.openSprinklerApi = openSprinklerApi
    this.config = config;
    this.sid = sid;
    this.name = name;
    this.currentState = false;
  }

  updateState(tuple) {
    // tuple is [programId, remaining, startedAt]
    // non-zero programId means sprinkler is running
    this.currentState = tuple[0] != 0
    this.log("updateState " + this.currentState);

    if (this.valveService) {
      this.valveService.getCharacteristic(Characteristic.Active)
			  .updateValue(this.currentState);
		
		  this.valveService.getCharacteristic(Characteristic.InUse)
			  .updateValue(this.currentState);
    }
  }

  getServices() {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "OpenSprinkler")
      .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-" + this.sid);
 
    this.valveService = new Service.Valve(this.name);
    this.valveService.getCharacteristic(Characteristic.ValveType).updateValue(1);

    this.valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getSprinklerOnCharacteristic.bind(this))
        .on('set', this.setSprinklerOnCharacteristic.bind(this));
 
    this.informationService = informationService;
    return [informationService, this.valveService];
  }

  getSprinklerOnCharacteristic(next) {
    this.log("getSprinklerOnCharacteristic returning " + this.currentState)
    next(null, this.currentState);
  }

  setSprinklerOnCharacteristic(on, next) {
    this.log("setSprinklerOnCharacteristic " + on)
    if (on)
      this.openSprinklerApi.setValve(this.sid, true, this.config.secondsOnEnable, next)
    else
      this.openSprinklerApi.setValve(this.sid, false, 0, next)
  }
}

