"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spectoda = void 0;
const functions_js_1 = require("./functions.js");
const i18n_js_1 = require("./i18n.js");
const socketio_js_1 = require("./lib/socketio.js");
const Logging_js_1 = require("./Logging.js");
const SpectodaInterfaceLegacy_js_1 = require("./SpectodaInterfaceLegacy.js");
const SpectodaParser_js_1 = require("./SpectodaParser.js");
// import { WEBSOCKET_URL } from "./SpectodaWebSocketsConnector.js";
// import { Interface } from "./src/SpectodaInterface.js";
const TimeTrack_js_1 = require("./TimeTrack.js");
require("./TnglReader.js");
const TnglReader_js_1 = require("./TnglReader.js");
require("./TnglWriter.js");
let lastEvents = {};
// should not create more than one object!
// the destruction of the Spectoda is not well implemented
// TODO - kdyz zavolam spectoda.connect(), kdyz jsem pripojeny, tak nechci aby se do interfacu poslal select
// TODO - kdyz zavolam funkci connect a uz jsem pripojeny, tak vyslu event connected, pokud si myslim ze nejsem pripojeny.
// TODO - "watchdog timer" pro resolve/reject z TC
class Spectoda {
    #uuidCounter;
    #ownerSignature;
    #ownerKey;
    #connecting;
    // #adoptingFlag;
    #adopting;
    #updating;
    #selected;
    #saveStateTimeoutHandle;
    #criteria;
    #reconnectRC;
    // #reconnectionInterval;
    #reconnecting;
    #connectionState;
    #autonomousConnection;
    constructor(connectorType = "default", reconnecting = true, runOnServer = false) {
        // nextjs
        if (typeof window === "undefined" && !runOnServer) {
            return;
        }
        this.timeline = new TimeTrack_js_1.TimeTrack(0, true);
        this.#uuidCounter = Math.floor(Math.random() * 0xffffffff);
        this.#ownerSignature = null;
        this.#ownerKey = null;
        this.interface = new SpectodaInterfaceLegacy_js_1.SpectodaInterfaceLegacy(this);
        if (connectorType) {
            this.interface.assignConnector(connectorType);
        }
        // this.#adoptingFlag = false;
        this.#adopting = false;
        this.#updating = false;
        // this.#saveStateTimeoutHandle = null;
        this.#reconnectRC = false;
        //this.#reconnectionInterval = reconnectionInterval;
        this.#reconnecting = reconnecting ? true : false;
        this.#connectionState = "disconnected";
        // this.interface.on("#connected", e => {
        //   this.#onConnected(e);
        // });
        // this.interface.on("#disconnected", e => {
        //   this.#onDisconnected(e);
        // });
        this.#autonomousConnection = false;
        this.interface.onConnected = event => {
            // if (!this.#adoptingFlag) {
            Logging_js_1.logging.info("> Interface connected");
            //   this.interface.emit("connected", { target: this });
            //   this.requestTimeline().catch(e => {
            //     logging.error("Timeline request after reconnection failed.", e);
            //   });
            // } else {
            //   logging.verbose("connected event skipped because of adopt");
            // }
        };
        this.interface.onDisconnected = event => {
            Logging_js_1.logging.info("> Interface disconnected");
            if (this.#connectionState === "connected" && this.#reconnecting) {
                return (0, functions_js_1.sleep)(100).then(() => {
                    return this.#connect(true);
                }).catch((error) => {
                    Logging_js_1.logging.warn("Reconnection failed.", error);
                });
            }
            else {
                this.#setConnectionState("disconnected");
            }
        };
        // auto clock sync loop
        setInterval(async () => {
            if (!this.#updating && this.interface.connector) {
                if (this.#getConnectionState() === "connected") {
                    return this.syncClock().catch((error) => {
                        Logging_js_1.logging.warn(error);
                    });
                }
                else if (this.#getConnectionState() === "disconnected" && this.#autonomousConnection) {
                    return this.#connect(true).catch((error) => {
                        Logging_js_1.logging.warn(error);
                    });
                }
            }
        }, 60000);
    }
    #setConnectionState(connectionState) {
        switch (connectionState) {
            case "connected":
                if (connectionState !== this.#connectionState) {
                    console.warn("> Spectoda connected");
                    this.#connectionState = connectionState;
                    this.interface.emit("connected", { target: this });
                }
                break;
            case "connecting":
                if (connectionState !== this.#connectionState) {
                    console.warn("> Spectoda connecting");
                    this.#connectionState = connectionState;
                    this.interface.emit("connecting", { target: this });
                }
                break;
            case "disconnecting":
                if (connectionState !== this.#connectionState) {
                    console.warn("> Spectoda disconnecting");
                    this.#connectionState = connectionState;
                    this.interface.emit("disconnecting", { target: this });
                }
                break;
            case "disconnected":
                if (connectionState !== this.#connectionState) {
                    console.warn("> Spectoda disconnected");
                    this.#connectionState = connectionState;
                    this.interface.emit("disconnected", { target: this });
                }
                break;
            default:
                throw "InvalidState";
        }
    }
    #getConnectionState() {
        return this.#connectionState;
    }
    requestWakeLock() {
        return this.interface.requestWakeLock();
    }
    releaseWakeLock() {
        return this.interface.releaseWakeLock();
    }
    setOwnerSignature(ownerSignature) {
        const reg = ownerSignature.match(/([\dabcdefABCDEF]{32})/g);
        if (!reg[0]) {
            throw "InvalidSignature";
        }
        this.#ownerSignature = reg[0];
        return true;
    }
    /**
     * @alias this.setOwnerSignature
     */
    assignOwnerSignature(ownerSignature) {
        return this.setOwnerSignature(ownerSignature);
    }
    getOwnerSignature() {
        return this.#ownerSignature;
    }
    setOwnerKey(ownerKey) {
        const reg = ownerKey.match(/([\dabcdefABCDEF]{32})/g);
        if (!reg[0]) {
            throw "InvalidKey";
        }
        this.#ownerKey = reg[0];
        return true;
    }
    /**
     * @alias this.setOwnerKey
     */
    assignOwnerKey(ownerKey) {
        return this.setOwnerKey(ownerKey);
    }
    getOwnerKey() {
        return this.#ownerKey;
    }
    setConnector(connector_type) {
        this.interface.assignConnector(connector_type);
    }
    /**
     * @alias this.setConnector
     */
    assignConnector(connector_type) {
        return this.setConnector(connector_type);
    }
    connectRemoteControl() {
        this.#reconnectRC = true;
        Logging_js_1.logging.info("> Connecting to Remote Control");
        if (!this.socket) {
            // TODO - scopovani dle apky
            // TODO - authentifikace
            this.socket = (0, socketio_js_1.io)("", {
                transports: ["websocket"],
            });
            this.socket.on("connect", () => {
                Logging_js_1.logging.info("> Connected to remote control");
                window.alert((0, i18n_js_1.t)("Connected to remote control"));
            });
            this.socket.on("disconnect", () => {
                Logging_js_1.logging.info("> Disconnected from remote control");
                window.alert((0, i18n_js_1.t)("Disconnected from remote control"));
                // if (this.#reconnectRC) {
                //   logging.debug("Disconnected by its own... Reloading");
                //   window.location.reload();
                // }
                // if (this.#reconnectRC) {
                //   logging.info("> Reconnecting Remote Control...");
                //   this.socket.connect();
                // }
            });
            // this.socket.on("deliver", async (reqId, payload) => {
            //   logging.debug("deliver", reqId, payload);
            //   this.interface
            //     .deliver(new Uint8Array(payload))
            //     .then(payload => {
            //       // ! missing returned payload
            //       payload = new Uint8Array(payload);
            //       this.socket.emit("response_success", reqId, payload);
            //     })
            //     .catch(error => this.socket.emit("response_error", reqId, error));
            // });
            // this.socket.on("transmit", async (reqId, payload) => {
            //   logging.debug("transmit", reqId, payload);
            //   this.interface
            //     .transmit(new Uint8Array(payload))
            //     .then(payload => {
            //       // ! missing returned payload
            //       payload = new Uint8Array(payload);
            //       this.socket.emit("response_success", reqId, payload);
            //     })
            //     .catch(error => this.socket.emit("response_error", reqId, error));
            // });
            this.socket.on("request", async (reqId, payload, read_response) => {
                Logging_js_1.logging.warn("request", reqId, payload);
                this.interface
                    .request(payload, read_response)
                    .then(payload => {
                    // ! missing returned payload
                    payload = payload;
                    Logging_js_1.logging.info({ reqId, payload });
                    this.socket.emit("response_success", reqId, payload);
                })
                    .catch(error => this.socket.emit("response_error", reqId, error));
            });
            this.socket.on("connect_error", error => {
                Logging_js_1.logging.debug("connect_error", error);
                setTimeout(() => {
                    this.socket.connect();
                }, 1000);
            });
            // this.socket.on("setClock", payload => {
            //   logging.warn("setClock", payload);
            // });
            // // ============= CLOCK HACK ==============
            // const hackClock = () => {
            //   logging.warn("overriding clock with UTC clock");
            //   this.interface.clock.setMillis(getClockTimestamp());
            //   this.syncClock();
            // };
            // hackClock();
            // this.interface.on("connected", () => {
            //   hackClock();
            // });
        }
        else {
            this.socket.connect();
        }
    }
    disconnectRemoteControl() {
        Logging_js_1.logging.info("> Disonnecting from the Remote Control");
        this.#reconnectRC = false;
        this.socket?.disconnect();
    }
    // valid UUIDs are in range [1..4294967295] (32-bit unsigned number)
    #getUUID() {
        if (this.#uuidCounter >= 4294967295) {
            this.#uuidCounter = 0;
        }
        return ++this.#uuidCounter;
    }
    /**
     * @name addEventListener
     * @param {string} event
     * @param {Function} callback
     *
     * events: "disconnected", "connected"
     *
     * all events: event.target === the sender object (SpectodaWebBluetoothConnector)
     * event "disconnected": event.reason has a string with a disconnect reason
     *
     * @returns {Function} unbind function
     */
    addEventListener(event, callback) {
        return this.interface.addEventListener(event, callback);
    }
    /**
     * @alias this.addEventListener
     */
    on(event, callback) {
        return this.interface.on(event, callback);
    }
    // každé spectoda zařízení může být spárováno pouze s jedním účtem. (jednim user_key)
    // jakmile je sparovana, pak ji nelze prepsat novým učtem.
    // filtr pro pripojovani k zarizeni je pak účet.
    // adopt != pair
    // adopt reprezentuje proces, kdy si webovka osvoji nove zarizeni. Tohle zarizeni, ale uz
    // muze byt spárováno s telefonem / SpectodaConnectem
    // pri adoptovani MUSI byt vsechny zarizeni ze skupiny zapnuty.
    // vsechny zarizeni totiz MUSI vedet o vsech.
    // adopt() {
    // const BLE_OPTIONS = {
    //   //acceptAllDevices: true,
    //   filters: [
    //     { services: [this.TRANSMITTER_SERVICE_UUID] },
    //     // {services: ['c48e6067-5295-48d3-8d5c-0395f61792b1']},
    //     // {name: 'ExampleName'},
    //   ],
    //   //optionalServices: [this.TRANSMITTER_SERVICE_UUID],
    // };
    // //
    // return this.connector
    //   .adopt(BLE_OPTIONS).then((device)=> {
    //     // ulozit device do local storage jako json
    //   })
    //   .catch((error) => {
    //     logging.warn(error);
    //   });
    // }
    scan(scan_criteria = [{}], scan_period = 5000) {
        Logging_js_1.logging.debug(`scan(scan_criteria=${scan_criteria}, scan_period=${scan_period})`);
        Logging_js_1.logging.info("> Scanning Spectoda Controllers...");
        return this.interface.scan(scan_criteria, scan_period);
    }
    adopt(newDeviceName = null, newDeviceId = null, tnglCode = null, ownerSignature = null, ownerKey = null, autoSelect = false) {
        Logging_js_1.logging.debug(`adopt(newDeviceName=${newDeviceName}, newDeviceId=${newDeviceId}, tnglCode=${tnglCode}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, autoSelect=${autoSelect})`);
        Logging_js_1.logging.info("> Adopting Spectoda Controller...");
        if (this.#adopting) {
            return Promise.reject("AdoptingInProgress");
        }
        this.#adopting = true;
        this.#setConnectionState("connecting");
        if (ownerSignature) {
            this.setOwnerSignature(ownerSignature);
        }
        if (ownerKey) {
            this.setOwnerKey(ownerKey);
        }
        if (!this.#ownerSignature) {
            throw "OwnerSignatureNotAssigned";
        }
        if (!this.#ownerKey) {
            throw "OwnerKeyNotAssigned";
        }
        const criteria = /** @type {any} */ ([{ adoptionFlag: true }]);
        return ((autoSelect ? this.interface.autoSelect(criteria, 4000) : this.interface.userSelect(criteria, 60000))
            .then(() => {
            // this.#adoptingFlag = true;
            return this.interface.connect(10000, true);
        })
            .then(() => {
            const owner_signature_bytes = (0, functions_js_1.hexStringToUint8Array)(this.#ownerSignature, 16);
            const owner_key_bytes = (0, functions_js_1.hexStringToUint8Array)(this.#ownerKey, 16);
            Logging_js_1.logging.info("owner_signature_bytes", owner_signature_bytes);
            Logging_js_1.logging.info("owner_key_bytes", owner_key_bytes);
            const request_uuid = this.#getUUID();
            const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes /*, ...device_name_bytes, ...numberToBytes(device_id, 1)*/];
            Logging_js_1.logging.info("> Adopting device...");
            Logging_js_1.logging.verbose(bytes);
            return this.interface
                .request(bytes, true)
                .then(response => {
                let reader = new TnglReader_js_1.TnglReader(response);
                Logging_js_1.logging.debug("response:", response);
                if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
                    throw "InvalidResponse";
                }
                const response_uuid = reader.readUint32();
                if (response_uuid != request_uuid) {
                    throw "InvalidResponse";
                }
                const error_code = reader.readUint8();
                let device_mac = "00:00:00:00:00:00";
                if (error_code === 0) { // error_code 0 is success
                    const device_mac_bytes = reader.readBytes(6);
                    device_mac = Array.from(device_mac_bytes, function (byte) {
                        return ("0" + (byte & 0xff).toString(16)).slice(-2);
                    }).join(":");
                }
                Logging_js_1.logging.debug(`error_code=${error_code}, device_mac=${device_mac}`);
                if (error_code === 0) {
                    Logging_js_1.logging.info(`Adopted ${device_mac} successfully`);
                    return this.rebootAndDisconnectDevice()
                        .catch(e => {
                        Logging_js_1.logging.error(e);
                    })
                        .then(() => {
                        // lastnumber = newDeviceName.match(/\d+/)[0];
                        // lastprefix = newDeviceName.replace(/\d+/g, "");
                        return {
                            mac: device_mac,
                            ownerSignature: this.#ownerSignature,
                            ownerKey: this.#ownerKey,
                            // name: newDeviceName,
                            // id: newDeviceId,
                        };
                    });
                }
                if (error_code !== 0) {
                    Logging_js_1.logging.warn("Adoption refused.");
                    window.alert((0, i18n_js_1.t)("Zkuste to, prosím, znovu."), (0, i18n_js_1.t)("Přidání se nezdařilo"), { confirm: (0, i18n_js_1.t)("OK") });
                    throw "AdoptionRefused";
                }
            })
                .catch(e => {
                Logging_js_1.logging.error(e);
                this.disconnect().finally(() => {
                    // @ts-ignore
                    throw "AdoptionFailed";
                });
            });
        })
            .catch(error => {
            Logging_js_1.logging.warn(error);
            if (error === "UserCanceledSelection") {
                return this.connected().then(result => {
                    if (!result)
                        throw "UserCanceledSelection";
                });
            }
        })
            .finally(() => {
            this.#adopting = false;
            // this.#adoptingFlag = false;
            this.#setConnectionState("disconnected");
        }));
    }
    #connect(autoConnect) {
        Logging_js_1.logging.info("> Connecting Spectoda Controller");
        this.#setConnectionState("connecting");
        Logging_js_1.logging.info("> Selecting device...");
        return (autoConnect ? this.interface.autoSelect(this.#criteria) : this.interface.userSelect(this.#criteria))
            .then(() => {
            Logging_js_1.logging.info("> Connecting interface...");
            return this.interface.connect();
        })
            .then(connectedDeviceInfo => {
            return this.requestTimeline().catch(e => {
                Logging_js_1.logging.error("Timeline request after reconnection failed.", e);
            }).then(() => {
                return this.readEventHistory().catch(e => {
                    Logging_js_1.logging.error("History request after reconnection failed.", e);
                });
            }).then(() => {
                Logging_js_1.logging.info("> Spectoda controller connected successfully.");
                this.#setConnectionState("connected");
                return connectedDeviceInfo;
            });
        })
            .catch(error => {
            Logging_js_1.logging.warn("> Connection failed with error: ", error);
            // TODO: tady tento catch by mel dal thrownout error jako ze nepodarilo pripojit.
            this.#setConnectionState("disconnected");
            // if (!this.#autonomousConnection) {
            //   logging.warn("Skipping error alerting");
            //   return;
            // }
            // if (error === "UserCanceledSelection") {
            //   throw "UserCanceledSelection";
            // }
            // if (error === "SecurityError") {
            //   logging.error(error);
            //   return;
            // }
            //@ts-ignore
            throw error.toString();
        });
    }
    // devices: [ {name:"Lampa 1", mac:"12:34:56:78:9a:bc"}, {name:"Lampa 2", mac:"12:34:56:78:9a:bc"} ]
    connect(devices = null, autoConnect = true, ownerSignature = null, ownerKey = null, connectAny = false, fwVersion = "", autonomousConnection = false, overrideConnection = false) {
        Logging_js_1.logging.debug(`connect(devices=${devices}, autoConnect=${autoConnect}, ownerSignature=${ownerSignature}, ownerKey=${ownerKey}, connectAny=${connectAny}, fwVersion=${fwVersion}, autonomousConnection=${autonomousConnection}, overrideConnection=${overrideConnection})`);
        Logging_js_1.logging.info("> Connecting to Spectoda Controller...");
        this.#autonomousConnection = autonomousConnection;
        if (!overrideConnection && this.#getConnectionState() === "connecting") {
            return Promise.reject("ConnectingInProgress");
        }
        if (ownerSignature) {
            this.setOwnerSignature(ownerSignature);
        }
        if (ownerKey) {
            this.setOwnerKey(ownerKey);
        }
        if (!this.#ownerSignature) {
            throw "OwnerSignatureNotAssigned";
        }
        if (!this.#ownerKey) {
            throw "OwnerKeyNotAssigned";
        }
        let criteria = /** @type {any} */ ([{ ownerSignature: this.#ownerSignature }]);
        if (devices && devices.length > 0) {
            let devices_criteria = /** @type {any} */ ([]);
            for (let i = 0; i < devices.length; i++) {
                let criterium = { ownerSignature: this.#ownerSignature };
                if (devices[i].name) {
                    criterium.name = devices[i].name.slice(0, 11);
                }
                if (devices[i].mac) {
                    criterium.mac = devices[i].mac;
                }
                if (devices[i].name || devices[i].mac) {
                    devices_criteria.push(criterium);
                }
            }
            if (devices_criteria.length != 0) {
                criteria = devices_criteria;
            }
        }
        if (connectAny) {
            if ((0, functions_js_1.detectSpectodaConnect)()) {
                criteria = [{}];
            }
            else {
                criteria = [{}, { adoptionFlag: true }, { legacy: true }];
            }
        }
        if (typeof fwVersion == "string" && fwVersion.match(/(!?)([\d]+).([\d]+).([\d]+)/)) {
            for (let i = 0; i < criteria.length; i++) {
                criteria[i].fwVersion = fwVersion;
            }
        }
        this.#criteria = criteria;
        return this.#connect(autoConnect);
    }
    disconnect() {
        this.#autonomousConnection = false;
        if (this.#connectionState === "disconnected") {
            Promise.reject("DeviceAlreadyDisconnected");
        }
        this.#setConnectionState("disconnecting");
        Logging_js_1.logging.info(`> Disconnecting controller...`);
        return this.interface.disconnect()
            .finally(() => {
            this.#setConnectionState("disconnected");
        });
    }
    connected() {
        // if (this.#connecting || this.#adopting) {
        //   return Promise.resolve(null); // resolve nothing === not connected
        // }
        // return this.interface.connected();
        return this.#getConnectionState() === "connected" ? this.interface.connected() : Promise.resolve(null);
    }
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // writes Tngl only if fingerprints does not match
    syncTngl(tngl_code, tngl_bytes = null, tngl_bank = 0) {
        Logging_js_1.logging.info(`> Syncing Tngl code...`);
        if (tngl_code === null && tngl_bytes === null) {
            return Promise.reject("InvalidParameters");
        }
        if (tngl_bytes === null) {
            tngl_bytes = new SpectodaParser_js_1.TnglCodeParser().parseTnglCode(tngl_code);
        }
        return this.getTnglFingerprint(tngl_bank).then(device_fingerprint => {
            return (0, functions_js_1.computeTnglFingerprint)(tngl_bytes, "fingerprint").then(new_fingerprint => {
                // logging.debug(device_fingerprint);
                // logging.debug(new_fingerprint);
                for (let i = 0; i < device_fingerprint.length; i++) {
                    if (device_fingerprint[i] !== new_fingerprint[i]) {
                        return this.writeTngl(null, tngl_bytes, tngl_bank);
                    }
                }
            });
        });
    }
    writeTngl(tngl_code, tngl_bytes = null, memory_bank = 0) {
        Logging_js_1.logging.info(`> Writing Tngl code...`);
        if (memory_bank === null || memory_bank === undefined) {
            memory_bank = 0;
        }
        if (tngl_code === null && tngl_bytes === null) {
            return Promise.reject("InvalidParameters");
        }
        if (tngl_bytes === null) {
            const parser = new SpectodaParser_js_1.TnglCodeParser();
            tngl_bytes = parser.parseTnglCode(tngl_code);
        }
        const timeline_flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
        const timeline_bytecode = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SET_TIMELINE, ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis(), 6), ...(0, functions_js_1.numberToBytes)(this.timeline.millis(), 4), timeline_flags];
        const reinterpret_bytecode = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_REINTERPRET_TNGL, ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis(), 6), memory_bank, ...(0, functions_js_1.numberToBytes)(tngl_bytes.length, 4), ...tngl_bytes];
        // logging.info(reinterpret_bytecode);
        const payload = [...timeline_bytecode, ...reinterpret_bytecode];
        return this.interface.execute(payload, "TNGL").then(() => {
            // logging.debug("Written");
            this.emitEvent("CONNE"); 
        });
    }
    // event_label example: "evt1"
    // event_value example: 1000
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     
     * @returns
     */
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     
     * @returns
     */
    emitEvent(event_label, device_ids = [0xff], force_delivery = true) {
        Logging_js_1.logging.verbose(`emitEvent(label=${event_label},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: null, type: "none" };
        // clearTimeout(this.#saveStateTimeoutHandle);
        // this.#saveStateTimeoutHandle = setTimeout(() => {
        //   this.saveState();
        // }, 5000);
        const func = device_id => {
            const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EMIT_EVENT, ...(0, functions_js_1.labelToBytes)(event_label), ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis() + 10, 6), (0, functions_js_1.numberToBytes)(device_id, 1)];
            return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };
        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        }
        else {
            return func(device_ids);
        }
    }
    resendAll() {
        Object.keys(lastEvents).forEach(key => {
            switch (lastEvents[key].type) {
                case "percentage":
                    this.emitPercentageEvent(key, lastEvents[key].value);
                    break;
                case "timestamp":
                    this.emitTimestampEvent(key, lastEvents[key].value);
                    break;
                case "color":
                    this.emitColorEvent(key, lastEvents[key].value);
                    break;
                case "label":
                    this.emitLabelEvent(key, lastEvents[key].value);
                    break;
                case "none":
                    this.emitEvent(key);
                    break;
            }
        });
    }
    // event_label example: "evt1"
    // event_value example: 1000
    /**
     *
     * @param {*} event_label
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     
     * @returns
     */
    emitTimestampEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        Logging_js_1.logging.verbose(`emitTimestampEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "timestamp" };
        clearTimeout(this.#saveStateTimeoutHandle);
        this.#saveStateTimeoutHandle = setTimeout(() => {
          this.saveState();
        }, 5000);
        if (event_value > 2147483647) {
            Logging_js_1.logging.error("Invalid event value");
            event_value = 2147483647;
        }
        if (event_value < -2147483648) {
            Logging_js_1.logging.error("Invalid event value");
            event_value = -2147483648;
        }
        const func = device_id => {
            const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EMIT_TIMESTAMP_EVENT, ...(0, functions_js_1.numberToBytes)(event_value, 4), ...(0, functions_js_1.labelToBytes)(event_label), ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis() + 10, 6), (0, functions_js_1.numberToBytes)(device_id, 1)];
            return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };
        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        }
        else {
            return func(device_ids);
        }
    }
    // event_label example: "evt1"
    // event_value example: "#00aaff"
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns
     */
    emitColorEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        Logging_js_1.logging.verbose(`emitColorEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "color" };
        clearTimeout(this.#saveStateTimeoutHandle);
        this.#saveStateTimeoutHandle = setTimeout(() => {
          this.saveState();
        }, 5000);
        event_value = (0, functions_js_1.cssColorToHex)(event_value);
        if (typeof event_value !== 'string' || !event_value.match(/#?[\dabcdefABCDEF]{6}/g)) {
            Logging_js_1.logging.error("Invalid event value. event_value=", event_value);
            event_value = "#000000";
        }
        const func = device_id => {
            const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EMIT_COLOR_EVENT, ...(0, functions_js_1.colorToBytes)(event_value), ...(0, functions_js_1.labelToBytes)(event_label), ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis() + 10, 6), (0, functions_js_1.numberToBytes)(device_id, 1)];
            return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };
        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        }
        else {
            return func(device_ids);
        }
    }
    // event_label example: "evt1"
    // event_value example: 100.0
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns
     */
    emitPercentageEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        Logging_js_1.logging.verbose(`emitPercentageEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "percentage" };
        clearTimeout(this.#saveStateTimeoutHandle);
        this.#saveStateTimeoutHandle = setTimeout(() => {
          this.saveState();
        }, 5000);
        if (event_value > 100.0) {
            Logging_js_1.logging.error("Invalid event value");
            event_value = 100.0;
        }
        if (event_value < -100.0) {
            Logging_js_1.logging.error("Invalid event value");
            event_value = -100.0;
        }
        const func = device_id => {
            const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EMIT_PERCENTAGE_EVENT, ...(0, functions_js_1.percentageToBytes)(event_value), ...(0, functions_js_1.labelToBytes)(event_label), ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis() + 10, 6), (0, functions_js_1.numberToBytes)(device_id, 1)];
            return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };
        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        }
        else {
            return func(device_ids);
        }
    }
    // event_label example: "evt1"
    // event_value example: "label"
    // !!! PARAMETER CHANGE !!!
    /**
     *
     * @param {*} event_label
     * @param {*} event_value
     * @param {number|number[]} device_ids
     * @param {*} force_delivery
     * @returns
     */
    emitLabelEvent(event_label, event_value, device_ids = [0xff], force_delivery = false) {
        Logging_js_1.logging.verbose(`emitLabelEvent(label=${event_label},value=${event_value},id=${device_ids},force=${force_delivery})`);
        lastEvents[event_label] = { value: event_value, type: "label" };
        clearTimeout(this.#saveStateTimeoutHandle);
        this.#saveStateTimeoutHandle = setTimeout(() => {
          this.saveState();
        }, 5000);
        if (typeof event_value !== "string") {
            Logging_js_1.logging.error("Invalid event value");
            event_value = "";
        }
        if (event_value.length > 5) {
            Logging_js_1.logging.error("Invalid event value");
            event_value = event_value.slice(0, 5);
        }
        const func = device_id => {
            const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EMIT_LABEL_EVENT, ...(0, functions_js_1.labelToBytes)(event_value), ...(0, functions_js_1.labelToBytes)(event_label), ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis() + 10, 6), (0, functions_js_1.numberToBytes)(device_id, 1)];
            return this.interface.execute(payload, force_delivery ? null : "E" + event_label + device_id);
        };
        if (typeof device_ids === "object") {
            let promises = device_ids.map(func);
            return Promise.all(promises);
        }
        else {
            return func(device_ids);
        }
    }
    syncTimeline() {
        Logging_js_1.logging.info(`> Synchronizing timeline`);
        Logging_js_1.logging.verbose("syncTimeline()");
        const flags = this.timeline.paused() ? 0b00010000 : 0b00000000; // flags: [reserved,reserved,reserved,timeline_paused,reserved,reserved,reserved,reserved]
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SET_TIMELINE, ...(0, functions_js_1.numberToBytes)(this.interface.clock.millis(), 6), ...(0, functions_js_1.numberToBytes)(this.timeline.millis(), 4), flags];
        return this.interface.execute(payload, "TMLN");
    }
    syncClock() {
        Logging_js_1.logging.info("> Syncing clock from device");
        return this.interface.syncClock().then(() => {
            Logging_js_1.logging.info("> App clock synchronized");
        });
    }
    // TODO add
    syncState(deviceId) {
        Logging_js_1.logging.info("> Synchronizing state...");
        const request_uuid = this.#getUUID();
        const device_request = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SYNC_STATE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), deviceId];
        return this.interface.request(device_request, false);
    }
    updateDeviceFirmware(firmware) {
        Logging_js_1.logging.info(`> Updating Controller FW...`);
        Logging_js_1.logging.verbose(`updateDeviceFirmware(firmware.length=${firmware?.length})`);
        if (!firmware || firmware.length < 10000) {
            Logging_js_1.logging.error("Invalid firmware");
            return Promise.reject("InvalidFirmware");
        }
        return this.interface.updateFW(firmware).finally(() => {
            return this.rebootDevice().catch(e => { console.warn(e); });
        });
    }
    updateNetworkFirmware(firmware) {
        Logging_js_1.logging.info(`> Updating Network FW...`);
        Logging_js_1.logging.verbose(`updateNetworkFirmware(firmware.length=${firmware?.length})`);
        if (!firmware || firmware.length < 10000) {
            Logging_js_1.logging.error("Invalid firmware");
            return Promise.reject("InvalidFirmware");
        }
        this.#updating = true;
        this.interface.requestWakeLock();
        return new Promise(async (resolve, reject) => {
            // const chunk_size = detectAndroid() ? 480 : 3984; // must be modulo 16
            // const chunk_size = 992; // must be modulo 16
            const chunk_size = 480;
            let index_from = 0;
            let index_to = chunk_size;
            let written = 0;
            Logging_js_1.logging.info("OTA UPDATE");
            Logging_js_1.logging.verbose(firmware);
            const start_timestamp = new Date().getTime();
            await (0, functions_js_1.sleep)(100);
            try {
                this.interface.emit("ota_status", "begin");
                {
                    //===========// RESET //===========//
                    Logging_js_1.logging.info("OTA RESET");
                    const command_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...(0, functions_js_1.numberToBytes)(0x00000000, 4)];
                    await this.interface.execute(command_bytes, null);
                }
                await (0, functions_js_1.sleep)(100);
                {
                    //===========// BEGIN //===========//
                    Logging_js_1.logging.info("OTA BEGIN");
                    const command_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...(0, functions_js_1.numberToBytes)(firmware.length, 4)];
                    await this.interface.execute(command_bytes, null, 20000);
                }
                // TODO optimalize this begin by detecting when all controllers have erased its flash
                // TODO also, right now the gateway controller sends to other controlles to erase flash after it is done.
                // TODO that slows things down
                await (0, functions_js_1.sleep)(20000);
                {
                    //===========// WRITE //===========//
                    Logging_js_1.logging.info("OTA WRITE");
                    while (written < firmware.length) {
                        if (index_to > firmware.length) {
                            index_to = firmware.length;
                        }
                        const command_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...(0, functions_js_1.numberToBytes)(written, 4), ...firmware.slice(index_from, index_to)];
                        await this.interface.execute(command_bytes, null);
                        written += index_to - index_from;
                        const percentage = Math.floor((written * 10000) / firmware.length) / 100;
                        Logging_js_1.logging.info(percentage + "%");
                        this.interface.emit("ota_progress", percentage);
                        index_from += chunk_size;
                        index_to = index_from + chunk_size;
                    }
                }
                await (0, functions_js_1.sleep)(100);
                {
                    //===========// END //===========//
                    Logging_js_1.logging.info("OTA END");
                    const command_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...(0, functions_js_1.numberToBytes)(written, 4)];
                    await this.interface.execute(command_bytes, null);
                }
                await (0, functions_js_1.sleep)(3000);
                Logging_js_1.logging.info("Rebooting whole network...");
                const command_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
                await this.interface.execute(command_bytes, null);
                Logging_js_1.logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");
                this.interface.emit("ota_status", "success");
                resolve(null);
                return;
            }
            catch (e) {
                this.interface.emit("ota_status", "fail");
                reject(e);
                return;
            }
        })
            // .then(() => {
            //   return this.disconnect();
            // })
            .finally(() => {
            this.interface.releaseWakeLock();
            this.#updating = false;
        });
    }
    async updatePeerFirmware(peer) {
        Logging_js_1.logging.info(`> Updating Peer ${peer} FW...`);
        Logging_js_1.logging.debug(`updatePeerFirmware(peer=${peer})`);
        if (peer === null || peer === undefined) {
            // Prompt the user to enter a MAC address
            peer = await prompt("Please enter a valid MAC address:", "00:00:00:00:00:00");
        }
        // Validate the input to ensure it is a valid MAC address
        if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(peer)) {
            // If the input is invalid, display an error message and return null
            throw "InvalidMacAdress";
        }
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...(0, functions_js_1.strMacToBytes)(peer)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_FW_UPDATE_PEER_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            if (error_code === 0) {
                Logging_js_1.logging.info(`Update sucessful`);
            }
            else {
                throw "Fail";
            }
        });
    }
    /**
     * @returns {Promise} config;
     *
     *
     *
     *
     */
    readDeviceConfig(mac = "ee:33:fa:89:08:08") {
        Logging_js_1.logging.info("> Reading device config...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_CONFIG_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_CONFIG_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            if (error_code === 0) {
                const config_size = reader.readUint32();
                Logging_js_1.logging.verbose(`config_size=${config_size}`);
                const config_bytes = reader.readBytes(config_size);
                Logging_js_1.logging.verbose(`config_bytes=${config_bytes}`);
                const decoder = new TextDecoder();
                const config = decoder.decode(new Uint8Array(config_bytes));
                Logging_js_1.logging.verbose(`config=${config}`);
                if (config.charAt(config.length - 1) == "\0") {
                    Logging_js_1.logging.warn("NULL config character detected");
                    return config.slice(0, config.length - 1);
                }
                return config;
            }
            else {
                throw "Fail";
            }
        });
    }
    /**
     * @param {string} config;
     *
     *
     *
     *
     */
    updateDeviceConfig(config) {
        Logging_js_1.logging.info("> Updating config...");
        const encoder = new TextEncoder();
        const config_bytes = encoder.encode(config);
        const config_bytes_size = config.length;
        // make config update request
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...(0, functions_js_1.numberToBytes)(config_bytes_size, 4), ...config_bytes];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CONFIG_UPDATE_RESPONSE) {
                throw "InvalidResponse";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponse";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            if (error_code === 0) {
                Logging_js_1.logging.info("Write Config Success");
                // reboot device
                const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
                return this.interface.request(payload, false);
            }
            else {
                throw "Fail";
            }
        });
    }
    /**
     * @param {string} config;
     *
     *
     *
     *
     */
    updateNetworkConfig(config) {
        Logging_js_1.logging.info("> Updating config of whole network...");
        const encoder = new TextEncoder();
        const config_bytes = encoder.encode(config);
        const config_bytes_size = config.length;
        // make config update request
        const request_uuid = this.#getUUID();
        const request_bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CONFIG_UPDATE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...(0, functions_js_1.numberToBytes)(config_bytes_size, 4), ...config_bytes];
        return this.interface.execute(request_bytes, "CONF").then(() => {
            Logging_js_1.logging.info("> Rebooting network...");
            const command_bytecode = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
            return this.interface.execute(command_bytecode, null);
        });
    }
    requestTimeline() {
        Logging_js_1.logging.info("> Requesting timeline...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_TIMELINE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            let reader = new TnglReader_js_1.TnglReader(response);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_TIMELINE_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            const clock_timestamp = reader.readUint48();
            const timeline_timestamp = reader.readInt32();
            const timeline_paused = reader.readUint8();
            Logging_js_1.logging.verbose(`clock_timestamp=${clock_timestamp}, timeline_timestamp=${timeline_timestamp}, timeline_paused=${timeline_paused}`);
            if (timeline_paused) {
                this.timeline.setState(timeline_timestamp, true);
            }
            else {
                this.timeline.setState(timeline_timestamp + (this.interface.clock.millis() - clock_timestamp), false);
            }
        });
    }
    // Code.device.interface.execute([240,1,0,0,0,5],null)
    rebootNetwork() {
        Logging_js_1.logging.info("> Rebooting network...");
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.interface.execute(payload, null);
    }
    rebootDevice() {
        Logging_js_1.logging.info("> Rebooting device...");
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.interface.request(payload, false);
    }
    rebootAndDisconnectDevice() {
        Logging_js_1.logging.info("> Rebooting and disconnecting device...");
        // this.interface.reconnection(false);
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_DEVICE_REBOOT_REQUEST];
        return this.interface.request(payload, false).then(() => {
            return this.disconnect();
        });
    }
    removeOwner() {
        Logging_js_1.logging.info("> Removing owner...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ERASE_OWNER_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            if (error_code !== 0) {
                throw "OwnerEraseFailed";
            }
            const removed_device_mac_bytes = reader.readBytes(6);
            return this.rebootAndDisconnectDevice()
                .catch(() => { })
                .then(() => {
                let removed_device_mac = "00:00:00:00:00:00";
                if (removed_device_mac_bytes.length >= 6) {
                    removed_device_mac = Array.from(removed_device_mac_bytes, function (byte) {
                        return ("0" + (byte & 0xff).toString(16)).slice(-2);
                    }).join(":");
                }
                return {
                    mac: removed_device_mac !== "00:00:00:00:00:00" ? removed_device_mac : null,
                };
            });
        });
    }
    removeNetworkOwner() {
        Logging_js_1.logging.info("> Removing network owner...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ERASE_OWNER_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.execute(bytes, true);
    }
    getFwVersion() {
        Logging_js_1.logging.info("> Requesting fw version...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_FW_VERSION_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        Logging_js_1.logging.debug("getFwVersion", { bytes });
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_FW_VERSION_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let version = null;
            if (error_code === 0) {
                version = reader.readString(32);
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.verbose(`version=${version}`);
            Logging_js_1.logging.debug(`> FW Version: ${version}`);
            return version.trim();
        });
    }
    getTnglFingerprint(tngl_bank = 0) {
        Logging_js_1.logging.info("> Getting TNGL fingerprint...");
        if (tngl_bank === null || tngl_bank === undefined) {
            tngl_bank = 0;
        }
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), tngl_bank];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug("response:", response);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_TNGL_FINGERPRINT_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let fingerprint = null;
            if (error_code === 0) {
                fingerprint = reader.readBytes(32);
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.verbose(`fingerprint=${fingerprint}`);
            return new Uint8Array(fingerprint);
        });
    }
    // setDeviceId(id) {
    //   logging.info("> Rebooting network...");
    //   const payload = [COMMAND_FLAGS.FLAG_DEVICE_ID, id];
    //   return this.connector.request(payload);
    // }
    // datarate in bits per second
    setNetworkDatarate(datarate) {
        Logging_js_1.logging.info(`> Setting network datarate to ${datarate} bsp...`);
        const request_uuid = this.#getUUID();
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CHANGE_DATARATE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...(0, functions_js_1.numberToBytes)(datarate, 4)];
        return this.interface.execute(payload, null);
    }
    readRomPhyVdd33() {
        Logging_js_1.logging.info("> Requesting rom_phy_vdd33 ...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ROM_PHY_VDD33_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let vdd_reading = null;
            if (error_code === 0) {
                vdd_reading = reader.readInt32();
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.info(`vdd_reading=${vdd_reading}`);
            return vdd_reading;
        });
    }
    readPinVoltage(pin) {
        Logging_js_1.logging.info(`> Requesting pin ${pin} voltage ...`);
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), pin];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_VOLTAGE_ON_PIN_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let pin_reading = null;
            if (error_code === 0) {
                pin_reading = reader.readUint32();
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.info(`pin_reading=${pin_reading}`);
            return pin_reading;
        });
    }
    /**
     * Change language for modals
     * @param {"en"|"cs"} lng
     */
    setLanguage(lng) {
        (0, i18n_js_1.changeLanguage)(lng);
    }
    setDebugLevel(level) {
        (0, Logging_js_1.setLoggingLevel)(level);
    }
    getConnectedPeersInfo() {
        Logging_js_1.logging.info("> Requesting connected peers info...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_CONNECTED_PEERS_INFO_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let peers = [];
            if (error_code === 0) {
                let count = reader.readUint16();
                for (let index = 0; index < count; index++) {
                    const mac = reader
                        .readBytes(6)
                        .map(v => v.toString(16).padStart(2, "0"))
                        .join(":");
                    const rssi = reader.readUint16() / (65535.0 / 512.0) - 256.0;
                    peers.push({
                        mac: mac,
                        rssi: rssi,
                    });
                }
                // logging.info(`count=${count}, peers=`, peers);
                Logging_js_1.logging.info(`count=${count}, peers=\n${peers.map(x => `mac:${x.mac},rssi:${x.rssi}`).join("\n")}`);
                this.interface.eraseConnectedPeers();
                this.interface.setConnectedPeers(peers.map(x => x.mac));
                return peers;
            }
            else {
                throw "Fail";
            }
        });
    }
    readEventHistory() {
        Logging_js_1.logging.info("> Requesting event history bytecode...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_EVENT_HISTORY_BC_RESPONSE) {
                Logging_js_1.logging.error("InvalidResponseFlag");
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                Logging_js_1.logging.error("InvalidResponseUuid");
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.info(`error_code=${error_code}`);
            if (error_code === 0) {
                const historic_events_bytecode_size = reader.readUint16();
                Logging_js_1.logging.info(`historic_events_bytecode_size=${historic_events_bytecode_size}`);
                const historic_events_bytecode = reader.readBytes(historic_events_bytecode_size);
                Logging_js_1.logging.verbose(`historic_events_bytecode=[${historic_events_bytecode}]`);
                this.interface.process(new DataView(new Uint8Array(historic_events_bytecode).buffer));
            }
            else {
                throw "Fail";
            }
        });
    }
    eraseEventHistory() {
        Logging_js_1.logging.info("> Erasing event history...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ERASE_EVENT_HISTORY_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.execute(bytes, true);
    }
    deviceSleep() {
        Logging_js_1.logging.info("> Sleep device...");
        const request_uuid = this.#getUUID();
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(payload, false);
    }
    networkSleep() {
        Logging_js_1.logging.info("> Sleep network...");
        const request_uuid = this.#getUUID();
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SLEEP_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.execute(payload, null);
    }
    saveState() {
        Logging_js_1.logging.info("> Saving state...");
        const request_uuid = this.#getUUID();
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_SAVE_STATE_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.execute(payload, null);
    }
    getControllerInfo() {
        Logging_js_1.logging.info("> Requesting controller info ...");
        const request_uuid = this.#getUUID();
        const bytes = [DEVICE_FLAGS.FLAG_CONTROLLER_INFO_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.verbose("response=", response);
            if (reader.readFlag() !== DEVICE_FLAGS.FLAG_CONTROLLER_INFO_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let pcb_code = null;
            let product_code = null;
            if (error_code === 0) {
                pcb_code = reader.readUint16();
                product_code = reader.readUint16();
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.info(`pcb_code=${pcb_code}`);
            Logging_js_1.logging.info(`product_code=${product_code}`);
            return { pcb_code: pcb_code, product_code: product_code };
        });
    }
    writeOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        Logging_js_1.logging.info("> Writing owner to device...");
        const owner_signature_bytes = (0, functions_js_1.hexStringToUint8Array)(ownerSignature, 16);
        const owner_key_bytes = (0, functions_js_1.hexStringToUint8Array)(ownerKey, 16);
        Logging_js_1.logging.info("owner_signature_bytes", owner_signature_bytes);
        Logging_js_1.logging.info("owner_key_bytes", owner_key_bytes);
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];
        Logging_js_1.logging.verbose(bytes);
        return this.interface
            .request(bytes, true)
            .then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug("response:", response);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ADOPT_RESPONSE) {
                throw "InvalidResponse";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponse";
            }
            let device_mac = "null";
            const error_code = reader.readUint8();
            // error_code 0 is success
            if (error_code === 0) {
                const device_mac_bytes = reader.readBytes(6);
                device_mac = Array.from(device_mac_bytes, function (byte) {
                    return ("0" + (byte & 0xff).toString(16)).slice(-2);
                }).join(":");
            }
            Logging_js_1.logging.debug(`error_code=${error_code}, device_mac=${device_mac}`);
            if (error_code === 0) {
                Logging_js_1.logging.info(`Adopted ${device_mac} successfully`);
                return {
                    mac: device_mac,
                    ownerSignature: this.#ownerSignature,
                    ownerKey: this.#ownerKey,
                    // name: newDeviceName,
                    // id: newDeviceId,
                };
            }
            else {
                Logging_js_1.logging.warn("Adoption refused by device.");
                throw "AdoptionRefused";
            }
        })
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "AdoptionFailed";
        });
    }
    writeNetworkOwner(ownerSignature = "00000000000000000000000000000000", ownerKey = "00000000000000000000000000000000") {
        Logging_js_1.logging.info("> Writing owner to network...");
        const owner_signature_bytes = (0, functions_js_1.hexStringToUint8Array)(ownerSignature, 16);
        const owner_key_bytes = (0, functions_js_1.hexStringToUint8Array)(ownerKey, 16);
        Logging_js_1.logging.info("owner_signature_bytes", owner_signature_bytes);
        Logging_js_1.logging.info("owner_key_bytes", owner_key_bytes);
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_ADOPT_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...owner_signature_bytes, ...owner_key_bytes];
        Logging_js_1.logging.verbose(bytes);
        return this.interface.execute(bytes, true);
    }
    // name as string
    writeControllerName(name) {
        Logging_js_1.logging.info("> Writing Controller Name...");
        const request_uuid = this.#getUUID();
        const payload = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_WRITE_CONTROLLER_NAME_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4), ...(0, functions_js_1.stringToBytes)(name, 16)];
        return this.interface.request(payload, false);
    }
    readControllerName() {
        Logging_js_1.logging.info("> Reading Controller Name...");
        const request_uuid = this.#getUUID();
        const bytes = [SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_REQUEST, ...(0, functions_js_1.numberToBytes)(request_uuid, 4)];
        return this.interface.request(bytes, true).then(response => {
            let reader = new TnglReader_js_1.TnglReader(response);
            Logging_js_1.logging.debug(`response.byteLength=${response.byteLength}`);
            if (reader.readFlag() !== SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_READ_CONTROLLER_NAME_RESPONSE) {
                throw "InvalidResponseFlag";
            }
            const response_uuid = reader.readUint32();
            if (response_uuid != request_uuid) {
                throw "InvalidResponseUuid";
            }
            const error_code = reader.readUint8();
            Logging_js_1.logging.verbose(`error_code=${error_code}`);
            let name = null;
            if (error_code === 0) {
                name = reader.readString(16);
            }
            else {
                throw "Fail";
            }
            Logging_js_1.logging.verbose(`name=${name}`);
            Logging_js_1.logging.debug(`> Controller Name: ${name}`);
            return name;
        });
    }
}
exports.Spectoda = Spectoda;
