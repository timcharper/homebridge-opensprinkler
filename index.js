var Accessory, Service, Characteristic, UUIDGen;
const request = require("request-promise-native")
const url = require('url');
const crypto = require('crypto');

const REQUEST_TIMEOUT = 10000

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-opensprinkler", "OpenSprinkler", SprinklerPlatform);
};


function withTimeoutCancellation(promise, duration) {
  return new Promise((success, reject) => {
    let timer = setTimeout(() => {
      console.log("too slow")
      reject("too slow")
    }, duration)
    promise.finally(() => clearTimeout(timer))
    promise.then(success,reject)
  })
}

function promiseSetter(log, fn) {
  return (value, next) => {
    fn(value).then(
      (result) => next(),
      (failure) => {
        log("failure " + failure)
        next(failure)
      }
    )
  }
}

class OpenSprinklerApi {
  constructor(log, config) {
    this.log = log
    this.baseUrl = "http://" + config.host
    if (config.password.md5)
      this.passwordMd5 = config.password.md5
    else
      this.passwordMd5 = crypto.createHash('md5').update(config.password.plain).digest("hex")
    this.statusUrl = this.urlFor("/ja")
  }

  urlFor(path, params) {
    let url = this.baseUrl + path + "?pw=" + this.passwordMd5
    if (params)
      url = url + "&" + params
    return url
  }

  _withResultHandling(promise, context) {
    return promise.then(
      (body) => {
          let json = JSON.parse(body)
          if (json.result == 1) {
            return true
          } else {
            return Promise.reject("result was " + body);
          }
      },
      (error) => {
        this.log("ERROR " + context)
        this.log(error)
        return Promise.reject(error)
      }
    )
  }

  getStatus() {
    try {
      return request({url: this.statusUrl, timeout: REQUEST_TIMEOUT}).then(
        JSON.parse,
        (error) => this.log(error))
    }
    catch (error) {
      return Promise.reject(error)
    }
  }

  setRainDelay(rd) {
    return this._withResultHandling(request({url: this.urlFor("/cv", "rd=" + rd), timeout: REQUEST_TIMEOUT}), "setRainDelay")
  }

  setValve(sid, enable, time) {
    let params = "sid=" + sid
    if (enable)
      params = params + "&en=1&t=" + time
    else
      params = params + "&en=0"

    return this._withResultHandling(request({url: this.urlFor("/cm", params), timeout: REQUEST_TIMEOUT}), "setValve")
  }
}

class SprinklerPlatform {
  constructor(log, config, api) {
    let self = this
    config.pollIntervalMs = config.pollIntervalMs || 5000
    config.defaultDurationSecs = config.defaultDurationSecs || 600
    config.enabledStationIds = config.enabledStationIds || [0,1,2,3]
    if (!config.host) {
      throw("Host must be specified in the configuration!")
    }
    if (!config.password) {
      throw("Password must be specified in the configuration!")
    }
    this.log = log;
    this.name = "Test valve"
    this.config = config;
    this.api = api;
    this.openSprinklerApi = new OpenSprinklerApi(log, config)
    this.pollIntervalMs = config.pollIntervalMs;

    this.accessories = function (next) {
      this.openSprinklerApi.getStatus().then(
        (json) => {
          let names = json.stations.snames
          self.log("Station names:")
          self.log(names)
          self.valves = config.enabledStationIds.map(function (valveIndex) {
            let sprinkler = new SprinklerStation(log, config, names[valveIndex], valveIndex, self.openSprinklerApi)
            sprinkler.updateState(json.settings.ps[valveIndex]);
            return(sprinkler)
          });
          self.rainDelay = new RainDelay(log, config, self.openSprinklerApi, json.settings.wto.d)
          self.poll();
          next(self.valves.concat([self.rainDelay]));
        },
        (error) => {
          log(error)
          next([])
        }
      )
    }
  }

  poll() {
    console.log("polling...")
    let done = withTimeoutCancellation(this.openSprinklerApi.getStatus(), this.pollIntervalMs * 5)
    done.then(
      (json) => {
        this.valves.forEach((valve) => {
          // tuple is [programId, remaining, startedAt]
          // non-zero programId means sprinkler is running
          let tuple = json.settings.ps[valve.sid]
          valve.updateState(json.settings.devt,
                            tuple[0],
                            tuple[1],
                            tuple[2],
                            json.status.sn[valve.sid]);
        });
        this.rainDelay.updateState(json.settings.rd, json.settings.wto.d);
      },
      (err) => {
        this.log("error while polling:", err)
      }
    )

    done.finally(() => {
      console.log("queueing up next poll...")
      setTimeout(() => this.poll(), this.pollIntervalMs)
    })
  }
}

class RainDelay {
  constructor(log, config, openSprinklerApi, rainDelayHoursSetting) {
    this.log = log;
    this.openSprinklerApi = openSprinklerApi
    this.rainDelayHoursSetting = rainDelayHoursSetting;
    this.name = "Rain Delay";
    this.currentState = false;
  }

  updateState(rd, rainDelayHoursSetting) {
    this.rainDelayHoursSetting = rainDelayHoursSetting
    // this.log("rain delay = " + rd);
    this.currentState = rd != 0;

    if (this.switchService) {
      this.switchService.getCharacteristic(Characteristic.On).
        updateValue(this.currentState);
    }
  }

  getServices() {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "OpenSprinkler")
      .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-raindelay");
    
    this.switchService = new Service.Switch(this.name);

    this.switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchOnCharacteristic.bind(this))
      .on('set', promiseSetter(this.log, this.setSwitchOnCharacteristic.bind(this)));
    
    this.informationService = informationService;
    return [informationService, this.switchService];
  }
  
  getSwitchOnCharacteristic(next) {
    next(null, this.currentState);
  }

  setSwitchOnCharacteristic(on) {
    let self = this
    this.log("setSprinklerOnCharacteristic " + on)
    if (on)
      return this.openSprinklerApi.setRainDelay(self.rainDelayHoursSetting)
    else
      return this.openSprinklerApi.setRainDelay(0)
  }
}

class SprinklerStation {
  constructor (log, config, name, sid, openSprinklerApi) {
    this.log = log;
    this.openSprinklerApi = openSprinklerApi
    this.config = config;
    this.setDuration = config.defaultDurationSecs
    this.sid = sid;
    this.name = name;
    this.currentlyActive = false;
    this.currentlyInUse = false;
  }

  updateState(currentTime, programId, remaining, startedAt, inUse) {
    this.currentlyInUse = inUse != 0 // inUse means it is spraying water
    this.currentlyActive = programId != 0 // active means it is associated with a program, but may not currently be active
    // this.log("inUse: " + this.currentlyInUse + " active: " + this.currentlyActive);

    if (this.valveService) {
      this.valveService.getCharacteristic(Characteristic.Active)
			  .updateValue(this.currentlyActive);
		
		  this.valveService.getCharacteristic(Characteristic.InUse)
			  .updateValue(this.currentlyInUse);

      this.valveService.getCharacteristic(Characteristic.RemainingDuration)
				.updateValue(remaining);
    }
  }

  getServices() {
    let informationService = new Service.AccessoryInformation();
    let self = this
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "OpenSprinkler")
      .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-" + this.sid);
 
    this.valveService = new Service.Valve(this.name);
    this.valveService.getCharacteristic(Characteristic.ValveType).updateValue(1);

    this.valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getSprinklerActiveCharacteristic.bind(this))
      .on('set', promiseSetter(this.log, this.setSprinklerActiveCharacteristic.bind(this)))

    this.valveService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getSprinklerInUseCharacteristic.bind(this))

    this.valveService.addCharacteristic(Characteristic.SetDuration)
      .on('get', (next) => {
        next(null, this.setDuration)
      })
			.on('set', (duration, next) => {
        self.setDuration = duration
        console.log("SetDuration", duration)
        next()
			})

    this.valveService.addCharacteristic(Characteristic.RemainingDuration)
 
    this.informationService = informationService;
    return [informationService, this.valveService];
  }

  getSprinklerActiveCharacteristic(next) {
    this.log("getSprinklerActiveCharacteristic returning " + this.currentlyActive)
    next(null, this.currentlyActive);
  }

  setSprinklerActiveCharacteristic(on) {
    this.log("setSprinklerActiveCharacteristic " + on)
    if (on)
      return this.openSprinklerApi.setValve(this.sid, true, this.setDuration)
    else
      return this.openSprinklerApi.setValve(this.sid, false, 0)
  }

  getSprinklerInUseCharacteristic(next) {
    this.log("getSprinklerInUseCharacteristic returning " + this.currentlyInUse)
    next(null, this.currentlyInUse);
  }
}

