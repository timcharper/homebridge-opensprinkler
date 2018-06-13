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
 
function SprinklerPlatform(log, config, api) {
  var self = this
  console.log("its a me")
  this.log = log;
  this.name = "Test valve"
  this.config = config;
  this.api = api;
  this.statusUrl = "http://" + config.host + "/ja?pw=" + config.password.md5;
  this.pollIntervalMs = config.pollIntervalMs || 5000;

  this.poll = function() {
    setTimeout(function() {
      request({url: self.statusUrl}, function(error, response, body) {
        self.poll()
        self.log("poll response")
        if (error != null) {
          self.log("ERROR DURING POLLING!")
          self.log(error)
        } else {
          json = JSON.parse(body)
          self.valves.forEach(function(valve) {
            valve.updateState(json.settings.ps[valve.sid]);
          });
          self.rainDelay.updateState(json.settings.rd);
        }
      })
    }, self.pollIntervalMs)
  };

  this.accessories = function (next) {
    request({url: self.statusUrl}, function(error, response, body) {
      self.log("response")
      if (error != null) {
        self.log("ERROR!")
        self.log(error)
        next([]);
      } else {
        json = JSON.parse(body)
        self.log(json.stations.snames)
        names = json.stations.snames
        self.valves = config.valves.map(function (valveIndex) {
          sprinkler = new SprinklerStation(log, config, names[valveIndex], valveIndex)
          sprinkler.updateState(json.settings.ps[valveIndex]);
          return(sprinkler)
        });
        self.rainDelay = new RainDelay(log, config)
        self.poll();

        next(self.valves.concat([self.rainDelay]));
      }
    });
  }.bind(this);
}


function RainDelay(log, config) {
  this.log = log;
  this.rainDelayHoursOnEnable = config.rainDelayHoursOnEnable || 24;
  this.config = config;
  this.name = "Rain Delay";
  this.currentState = false;
}

RainDelay.prototype = {
  updateState: function(rd) {
    this.log("rain delay = " + rd);
    this.currentState = rd != 0;

    if (this.switchService) {
      this.switchService.getCharacteristic(Characteristic.On).
        updateValue(this.currentState);
    }
  },
  getServices: function(next) {
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
  },
  getSwitchOnCharacteristic: function(next) {
    next(null, this.currentState);
  },
  setSwitchOnCharacteristic: function(on, next) {
    self = this
    this.log("setSprinklerOnCharacteristic " + on)
    baseUrl = "http://" + this.config.host + "/cv?pw=" + this.config.password.md5;
    if (on) {
      request(
        {url: baseUrl + "&rd=" + self.rainDelayHoursOnEnable},
        function(error, response, body) {
          if (error != null) {
            self.log("ERROR turning on rain delay")
            self.log(error)
            next(error);
          } else {
            json = JSON.parse(body)
            if (json.result == 1) {
              next();
            } else {
              next("result was " + body);
            }
          }
        }
      );
    } else {
      // stopping
      request(
        {url: baseUrl + "&rd=0"},
        function(error, response, body) {
          if (error != null) {
            self.log("ERROR turning off rain delay")
            self.log(error)
            next(error);
          } else {
            self.log("stopping rain");
            json = JSON.parse(body)
            if (json.result == 1) {
              next();
            } else {
              next("result was " + body);
            }
          }
        }
      );
    }
  }
}

function SprinklerStation(log, config, name, sid) {
  this.log = log;
  this.config = config;
  this.sid = sid;
  this.name = name;
  this.currentState = false;
}

SprinklerStation.prototype = {
  updateState: function (tuple) {
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
  },
  getServices: function () {
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
  },

  getSprinklerOnCharacteristic: function (next) {
    this.log("getSprinklerOnCharacteristic returning " + this.currentState)
    next(null, this.currentState);
  },
   
  setSprinklerOnCharacteristic: function (on, next) {
    self = this
    this.log("setSprinklerOnCharacteristic " + on)
    baseUrl = "http://" + this.config.host + "/cm?pw=" + this.config.password.md5;
    if (on) {
      request(
        {url: baseUrl + "&en=1&t=" + this.config.secondsOnEnable + "&sid=" + this.sid},
        function(error, response, body) {
          if (error != null) {
            self.log("ERROR turning valve " + self.name + " on!")
            self.log(error)
            next(error);
          } else {
            json = JSON.parse(body)
            if (json.result == 1) {
              next();
            } else {
              next("result was " + body);
            }
          }
        }
      );
    } else {
      // stopping
      request(
        {url: baseUrl + "&en=0&sid=" + this.sid},
        function(error, response, body) {
          if (error != null) {
            self.log("ERROR turning valve " + self.name + " off!")
            self.log(error)
            next(error);
          } else {
            json = JSON.parse(body)
            if (json.result == 1) {
              next();
            } else {
              next("result was " + body);
            }
          }
        }
      );
    }
  }
};
