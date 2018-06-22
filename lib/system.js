function SystemModule(config, log, openSprinklerApi, Devices) {
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

  class System {
    constructor(status) {
      let names = status.stations.snames
      log("Station names:")
      log(names)
      this.valves = config.enabledStationIds.map(function (valveIndex) {
        let sprinkler = new Devices.SprinklerStation(names[valveIndex], valveIndex)
        sprinkler.updateState(status.settings.ps[valveIndex]);
        return(sprinkler)
      });
      this.rainDelay = new Devices.RainDelay(status.settings.wto.d)
      this.poll();
    }

    getAccessories() {
      return this.valves.concat([this.rainDelay])
    }

    poll() {
      console.log("polling...")
      let done = withTimeoutCancellation(openSprinklerApi.getStatus(), config.pollIntervalMs * 5)
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
          log("error while polling:", err)
        }
      )

      done.finally(() => {
        console.log("queueing up next poll...")
        setTimeout(() => this.poll(), config.pollIntervalMs)
      })
    }
  }

  System.connect = () =>
    openSprinklerApi.getStatus().then((status) => new System(status))

  return System
}

module.exports = SystemModule
