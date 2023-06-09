"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpectodaWebSocketsConnector = exports.WEBSOCKET_URL = void 0;
const Logging_js_1 = require("./Logging.js");
const functions_js_1 = require("./functions.js");
const TimeTrack_js_1 = require("./TimeTrack.js");
const socketio_js_1 = require("./lib/socketio.js");
const nanoid_1 = require("nanoid");
// const WEBSOCKET_URL = "https://tangle-remote-control.glitch.me/"
exports.WEBSOCKET_URL = "https://ws.host.spectoda.com/";
/////////////////////////////////////////////////////////////////////////////////////
class SpectodaWebSocketsConnector {
    #interfaceReference;
    #selected;
    #connected;
    #promise;
    constructor(interfaceReference) {
        this.type = "websockets";
        this.#interfaceReference = interfaceReference;
        this.#selected = false;
        this.#connected = false;
        this.socket = null;
        this.#promise = null;
    }
    userSelect(criteria) {
        this.#selected = true;
        return Promise.resolve({ connector: this.type });
    }
    autoSelect(criteria, scan_period, timeout) {
        this.#selected = true;
        return Promise.resolve({ connector: this.type });
    }
    selected() {
        return Promise.resolve(this.#selected ? { connector: this.type } : null);
    }
    unselect() {
        this.#selected = false;
        return Promise.resolve();
    }
    scan(criteria, scan_period) {
        // returns devices like autoSelect scan() function
        return Promise.resolve("{}");
    }
    connect(timeout) {
        if (this.#selected) {
            if (!this.#connected) {
                const timetou_handle = setTimeout(() => {
                    console.error("WebSockets timeout");
                    reject("ConnectionFailed");
                }, timeout * 1.5);
                return new Promise((resolve, reject) => {
                    if (!this.socket) {
                        this.socket = (0, socketio_js_1.io)(exports.WEBSOCKET_URL, { transports: ["websocket"] });
                        window.wssocket = this.socket;
                        Logging_js_1.logging.debug(this.socket);
                        this.socket.on("connect", socket => {
                            Logging_js_1.logging.info("> Connected to remote control");
                            // socket.join("sans-souci");
                            this.#connected = true;
                            this.#interfaceReference.emit("#connected");
                            clearTimeout(timetou_handle);
                            resolve({ connector: this.type });
                        });
                        this.socket.on("disconnect", () => {
                            Logging_js_1.logging.info("> Disconnected from remote control");
                            this.#connected = false;
                            this.#interfaceReference.emit("#disconnected");
                            clearTimeout(timetou_handle);
                            reject("ConnectionFailed");
                        });
                        this.socket.on("connect_error", error => {
                            Logging_js_1.logging.error(error);
                            this.#connected = false;
                            clearTimeout(timetou_handle);
                            reject("ConnectionFailed");
                            // setTimeout(() => {
                            //   this.socket.connect();
                            // }, 1000);
                        });
                    }
                    else {
                        this.socket.connect();
                    }
                });
            }
            else {
                return Promise.resolve({ connector: this.type });
            }
        }
        else {
            return Promise.reject("NotSelected");
        }
    }
    connected() {
        return Promise.resolve(this.#connected ? { connector: this.type } : null);
    }
    disconnect() {
        if (this.#selected) {
            if (this.#connected) {
                this.#connected = false;
                this.socket.disconnect();
            }
            return Promise.resolve();
        }
        else {
            return Promise.reject("NotSelected");
        }
    }
    deliver(payload, timeout) {
        if (this.#connected) {
            const reqId = (0, nanoid_1.nanoid)();
            // console.log("Emit deliver", reqId, payload);
            this.socket.emit("deliver", reqId, payload);
            const socket = this.socket;
            this.#promise = new Promise((resolve, reject) => {
                const timeout_handle = setTimeout(() => rejectFunc(reqId, "timeout"), timeout);
                function resolveFunc(reqId, response) {
                    if (reqId === reqId) {
                        resolve(response);
                        socket.off("response_error", rejectFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                function rejectFunc(reqId, error) {
                    if (reqId === reqId) {
                        reject(error);
                        socket.off("response_success", resolveFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                this.socket.once("response_success", resolveFunc);
                this.socket.once("response_error", rejectFunc);
            });
            return this.#promise;
        }
        else {
            return Promise.reject("Disconnected");
        }
    }
    transmit(payload, timeout) {
        if (this.#connected) {
            const reqId = (0, nanoid_1.nanoid)();
            // console.log("Emit transmit", reqId, payload);
            this.socket.emit("transmit", reqId, payload);
            const socket = this.socket;
            this.#promise = new Promise((resolve, reject) => {
                const timeout_handle = setTimeout(() => rejectFunc(reqId, "timeout"), timeout);
                function resolveFunc(reqId, response) {
                    if (reqId === reqId) {
                        resolve(response);
                        socket.off("response_error", rejectFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                function rejectFunc(reqId, error) {
                    if (reqId === reqId) {
                        reject(error);
                        socket.off("response_success", resolveFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                this.socket.once("response_success", resolveFunc);
                this.socket.once("response_error", rejectFunc);
            });
            return this.#promise;
        }
        else {
            return Promise.reject("Disconnected");
        }
    }
    request(payload, read_response, timeout) {
        if (this.#connected) {
            const reqId = (0, nanoid_1.nanoid)();
            // console.log("Emit request", reqId, payload, read_response);
            this.socket.emit("request", reqId, payload, read_response);
            const socket = this.socket;
            this.#promise = new Promise((resolve, reject) => {
                const timeout_handle = setTimeout(() => rejectFunc(reqId, "timeout"), timeout);
                function resolveFunc(reqId, response) {
                    // console.log(reqId, new DataView(new Uint8Array(response).buffer));
                    if (reqId === reqId) {
                        resolve(new DataView(new Uint8Array(response).buffer));
                        socket.off("response_error", rejectFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                function rejectFunc(reqId, error) {
                    // console.log(reqId, "Failed", error);
                    if (reqId === reqId) {
                        reject(error);
                        socket.off("response_success", resolveFunc);
                        clearTimeout(timeout_handle);
                    }
                }
                // TODO optimize this to kill the socket if the request is not received and destroy also the second socket
                this.socket.once("response_success", resolveFunc);
                this.socket.once("response_error", rejectFunc);
                // todo kill sockets on receive
            });
            return this.#promise;
        }
        else {
            return Promise.reject("Disconnected");
        }
    }
    setClock(clock) {
        // if (this.#connected) {
        //   //const message = JSON.stringify({ clock_timestamp: clock.millis(), utc_timestamp: new Date().getTime() });
        //   const payload = new Uint8Array([ ...toBytes(clock.millis(), 4), ...toBytes(new Date().getTime(), 4) ]);
        //   this.socket.emit("setClock", payload);
        //   return Promise.resolve();
        // } else {
        //   return Promise.reject("Disconnected");
        // }
        return Promise.reject("Not Supported");
    }
    getClock() {
        // if (this.#connected) {
        //   let clock = new TimeTrack(0);
        //   //const message = JSON.stringify({ clock_timestamp: clock.millis(), utc_timestamp: new Date().getTime() });
        //   const payload = new Uint8Array([ ...toBytes(clock.millis(), 4), ...toBytes(new Date().getTime(), 4) ]);
        //   this.socket.emit("setClock", payload);
        //   return Promise.resolve(clock);
        // } else {
        //   return Promise.reject("Disconnected");
        // }
        // ============= CLOCK HACK ==============
        if (this.#connected) {
            return Promise.resolve(new TimeTrack_js_1.TimeTrack(0));
        }
        else {
            return Promise.reject("Disconnected");
        }
    }
    updateFW(firmware) {
        // return new Promise(async (resolve, reject) => {
        //   if (!this.#connected) {
        //     reject("Disconnected");
        //     return;
        //   }
        //   this.#interfaceReference.emit("ota_status", "begin");
        //   await sleep(1000);
        //   for (let percentage = 1; percentage <= 100; percentage++) {
        //     this.#interfaceReference.emit("ota_progress", percentage);
        //     await sleep(50);
        //     if (!this.#connected) {
        //       this.#interfaceReference.emit("ota_status", "fail");
        //       reject("Connection Failure");
        //       return;
        //     }
        //     if (Math.random() <= 0.01) {
        //       this.#interfaceReference.emit("ota_status", "fail");
        //       reject("Simulated Failure");
        //       return;
        //     }
        //   }
        //   await sleep(1000);
        //   this.#interfaceReference.emit("ota_status", "success");
        //   resolve();
        //   return;
        // });
        return Promise.reject("Not supported");
    }
    destroy() {
        return this.disconnect()
            .catch(() => { })
            .then(() => {
            return this.unselect();
        })
            .catch(() => { });
    }
}
exports.SpectodaWebSocketsConnector = SpectodaWebSocketsConnector;
