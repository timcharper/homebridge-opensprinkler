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
          sprinkler = new mySprinkler(log, config, names[valveIndex], valveIndex)
          sprinkler.updateState(json.settings.ps[valveIndex]);
          return(sprinkler)
        });
        self.poll();

        next(self.valves)
      }
    });
  }.bind(this);
}


function mySprinkler(log, config, name, sid) {
  this.log = log;
  this.config = config;
  this.sid = sid;
  this.name = name;
  this.currentState = false;
  this.valveService = new Service.Valve(this.name);
  this.valveService.getCharacteristic(Characteristic.ValveType).updateValue(1);
}

mySprinkler.prototype = {
  updateState: function (tuple) {
    // tuple is [programId, remaining, startedAt]
    // non-zero programId means sprinkler is running
    this.currentState = tuple[0] != 0
    this.log("updateState " + this.currentState);

    this.valveService.getCharacteristic(Characteristic.Active)
			.updateValue(this.currentState);
		   
		this.valveService.getCharacteristic(Characteristic.InUse)
			.updateValue(this.currentState);
  },
  getServices: function () {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "OpenSprinkler")
      .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-" + this.sid);
 

    this.valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getSprinklerOnCharacteristic.bind(this))
        .on('set', this.setSprinklerOnCharacteristic.bind(this));
 
    this.informationService = informationService;
    return [informationService, this.valveService];
  },

  getSprinklerOnCharacteristic: function (next) {
    this.log("getSprinklerOnCharacteristic returning " + this.currentState)
    const me = this;
    // request({
    //     url: me.getUrl,
    //     method: 'GET',
    // }, 
    // function (error, response, body) {
    //   if (error) {
    //     me.log('STATUS: ' + response.statusCode);
    //     me.log(error.message);
    //     return next(error);
    //   }
    //   return next(null, body.currentState);
    // });
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
    // curl 'http://sprinkler.lan/cm?sid=0&en=1&t=60&pw=a6d82bced638de3def1e9bbb4983225c' -H 'Host: sprinkler.lan' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:60.0) Gecko/20100101 Firefox/60.0' -H 'Accept: application/json, text/javascript, */*; q=0.01' -H 'Accept-Language: en-US,en;q=0.5' --compressed -H 'Referer: http://sprinkler.lan/' -H 'X-Requested-With: XMLHttpRequest' -H 'Connection: keep-alive'
    // curl 'http://sprinkler.lan/cm?sid=0&en=0&pw=a6d82bced638de3def1e9bbb4983225c' -H 'Host: sprinkler.lan' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:60.0) Gecko/20100101 Firefox/60.0' -H 'Accept: text/plain, */*; q=0.01' -H 'Accept-Language: en-US,en;q=0.5' --compressed -H 'Referer: http://sprinkler.lan/' -H 'X-Requested-With: XMLHttpRequest' -H 'Connection: keep-alive'
  }
};
