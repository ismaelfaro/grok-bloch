/*
 * Copyright 2019 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Noise model of a single physical qubit.
 *
 * The model has the same ingredients that quantum hardware providers publish in
 * their calibration data, and that Qiskit Aer uses when it builds a noise model
 * from a backend:
 *
 *   - T1, energy relaxation time (amplitude damping towards |0>)
 *   - T2, dephasing time (shrinks the equatorial components)
 *   - single qubit gate error, modelled as a depolarizing channel
 *   - gate duration, which decides how much T1/T2 decay happens per gate
 *   - readout assignment errors, applied when the qubit is measured
 *
 * Times are held in microseconds, gate lengths in nanoseconds, which is how
 * providers report them.
 */
class NoiseModel {
    constructor(config) {
        config = config || {};

        this.id = config.id || 'custom';
        this.name = config.name || 'Custom noise model';
        this.provider = config.provider || 'Custom';
        this.description = config.description || '';
        this.source = config.source || '';

        this.t1Us = NoiseModel.positive(config.t1Us, 100);
        this.t2Us = NoiseModel.positive(config.t2Us, 100);

        // Average error per single qubit physical pulse (e.g. an sx gate),
        // as reported by randomized benchmarking.
        this.singleQubitErrorRate = NoiseModel.clamp(
            NoiseModel.number(config.singleQubitErrorRate, 2.5e-4), 0, 0.5);
        this.singleQubitGateTimeNs = Math.max(0, NoiseModel.number(config.singleQubitGateTimeNs, 35));

        this.readoutError0as1 = NoiseModel.clamp(NoiseModel.number(config.readoutError0as1, 0), 0, 1);
        this.readoutError1as0 = NoiseModel.clamp(NoiseModel.number(config.readoutError1as0, 0), 0, 1);
        this.readoutTimeUs = Math.max(0, NoiseModel.number(config.readoutTimeUs, 0));

        // Residual thermal excitation, i.e. P(|1>) at equilibrium.
        this.excitedStatePopulation = NoiseModel.clamp(
            NoiseModel.number(config.excitedStatePopulation, 0), 0, 0.5);

        // On superconducting hardware Rz is a frame change performed in
        // software, so Z type gates take no time and add no error.
        this.virtualZ = config.virtualZ !== false;

        this.clampT2();
    }

    static number(value, fallback) {
        return (typeof value === 'number' && isFinite(value)) ? value : fallback;
    }

    static positive(value, fallback) {
        var n = NoiseModel.number(value, fallback);
        return n > 0 ? n : fallback;
    }

    static clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    /** T2 cannot exceed 2*T1 for a physical qubit. */
    clampT2() {
        if (this.t2Us > 2 * this.t1Us) {
            this.t2Us = 2 * this.t1Us;
        }
    }

    isNoiseless() {
        return this.singleQubitErrorRate === 0 &&
            this.readoutError0as1 === 0 &&
            this.readoutError1as0 === 0 &&
            this.t1Us >= 1e11 && this.t2Us >= 1e11;
    }

    /**
     * Number of physical pulses a logical gate costs. Gate errors and durations
     * scale with this, which is why an Rx(theta) is noisier than a Hadamard and
     * why S/T/Z can be free on superconducting hardware.
     */
    pulseCount(gate) {
        var type = (gate && gate.type) || 'pauli';
        if (type === 'virtualz') {
            return this.virtualZ ? 0 : 1;
        }
        if (type === 'rotation') {
            return 2;
        }
        if (type === 'identity') {
            return 0;
        }
        return 1;
    }

    /**
     * Thermal relaxation over a duration, as an affine map on the Bloch vector.
     *   transverse components decay as exp(-t/T2)
     *   longitudinal component relaxes towards equilibrium as exp(-t/T1)
     */
    relaxationChannel(durationUs, noiseScale) {
        var scale = noiseScale > 0 ? noiseScale : 1;
        if (durationUs <= 0) {
            return { ax: 1, ay: 1, az: 1, cz: 0 };
        }

        var longitudinal = Math.exp(-durationUs * scale / this.t1Us);
        var transverse = Math.exp(-durationUs * scale / this.t2Us);
        var equilibriumZ = 1 - 2 * this.excitedStatePopulation;

        return {
            ax: transverse,
            ay: transverse,
            az: longitudinal,
            cz: (1 - longitudinal) * equilibriumZ
        };
    }

    /**
     * Depolarizing probability that brings the *combined* (relaxation plus
     * depolarizing) channel up to the reported average gate error. Reported
     * gate errors already contain the decoherence that happens during the
     * pulse, so adding both at full strength would double count it. Qiskit's
     * device noise model makes the same correction.
     *
     * For a channel whose Bloch vector map is r -> A r + c, the average gate
     * fidelity is F = (1 + Tr(A)/3) / 2.
     */
    depolarizingParameter(pulses, durationUs, noiseScale) {
        if (pulses <= 0) return 0;

        var scale = noiseScale > 0 ? noiseScale : 1;
        var targetError = NoiseModel.clamp(this.singleQubitErrorRate * pulses * scale, 0, 0.5);
        if (targetError <= 0) return 0;

        var relaxation = this.relaxationChannel(durationUs, scale);
        var traceA = 2 * relaxation.ax + relaxation.az;
        if (traceA <= 1e-12) return 1;

        var depolarizing = 1 - 3 * (1 - 2 * targetError) / traceA;
        return NoiseModel.clamp(depolarizing, 0, 1);
    }

    /** Duration of a gate, in microseconds. */
    gateDurationUs(pulses) {
        return pulses * this.singleQubitGateTimeNs / 1000;
    }

    /** Probability of reading a 1 given the true |1> probability of the qubit. */
    measuredProbability1(trueProbability1) {
        var trueProbability0 = 1 - trueProbability1;
        return NoiseModel.clamp(
            trueProbability1 * (1 - this.readoutError1as0) + trueProbability0 * this.readoutError0as1,
            0, 1);
    }

    /** Average gate infidelity actually produced for a gate, useful for display. */
    effectiveGateError(gate, noiseScale) {
        var pulses = this.pulseCount(gate);
        if (pulses === 0) return 0;

        var durationUs = this.gateDurationUs(pulses);
        var relaxation = this.relaxationChannel(durationUs, noiseScale);
        var depolarizing = this.depolarizingParameter(pulses, durationUs, noiseScale);
        var traceA = (1 - depolarizing) * (2 * relaxation.ax + relaxation.az);
        return NoiseModel.clamp(1 - (1 + traceA / 3) / 2, 0, 1);
    }

    toJSON() {
        return {
            name: this.name,
            provider: this.provider,
            description: this.description,
            t1Us: this.t1Us,
            t2Us: this.t2Us,
            singleQubitErrorRate: this.singleQubitErrorRate,
            singleQubitGateTimeNs: this.singleQubitGateTimeNs,
            readoutError0as1: this.readoutError0as1,
            readoutError1as0: this.readoutError1as0,
            readoutTimeUs: this.readoutTimeUs,
            excitedStatePopulation: this.excitedStatePopulation,
            virtualZ: this.virtualZ
        };
    }
}

/*
 * Built in noise models.
 *
 * These are approximate, rounded values in the range publicly reported for each
 * device family (median calibration figures published by the providers). They
 * are meant to show the relative behaviour of different hardware generations,
 * not to reproduce one specific chip on one specific day. Load a calibration
 * file to simulate a real qubit.
 */
NoiseModel.PRESETS = [{
    id: 'ideal',
    name: 'Ideal qubit (no noise)',
    provider: 'Textbook',
    description: 'Perfect unitary evolution, infinite coherence. The reference every other model is scored against.',
    source: 'Textbook',
    t1Us: 1e12,
    t2Us: 1e12,
    singleQubitErrorRate: 0,
    singleQubitGateTimeNs: 0,
    readoutError0as1: 0,
    readoutError1as0: 0
}, {
    id: 'ibm_heron',
    name: 'IBM Heron (ibm_fez / ibm_torino class)',
    provider: 'IBM Quantum',
    description: 'Current generation IBM tunable-coupler superconducting processor.',
    source: 'Approximate median values from published IBM Quantum calibration data',
    t1Us: 180,
    t2Us: 130,
    singleQubitErrorRate: 2.4e-4,
    singleQubitGateTimeNs: 32,
    readoutError0as1: 0.008,
    readoutError1as0: 0.016,
    readoutTimeUs: 1.4,
    excitedStatePopulation: 0.01
}, {
    id: 'ibm_eagle',
    name: 'IBM Eagle r3 (ibm_brisbane / ibm_kyiv class)',
    provider: 'IBM Quantum',
    description: '127 qubit superconducting processor, fixed coupling.',
    source: 'Approximate median values from published IBM Quantum calibration data',
    t1Us: 220,
    t2Us: 130,
    singleQubitErrorRate: 2.6e-4,
    singleQubitGateTimeNs: 60,
    readoutError0as1: 0.009,
    readoutError1as0: 0.018,
    readoutTimeUs: 1.2,
    excitedStatePopulation: 0.012
}, {
    id: 'ibm_falcon',
    name: 'IBM Falcon r5 (27 qubit class)',
    provider: 'IBM Quantum',
    description: 'The 27 qubit generation that ran most of the early quantum volume records.',
    source: 'Approximate median values from published IBM Quantum calibration data',
    t1Us: 130,
    t2Us: 110,
    singleQubitErrorRate: 2.7e-4,
    singleQubitGateTimeNs: 35.5,
    readoutError0as1: 0.010,
    readoutError1as0: 0.020,
    readoutTimeUs: 0.75,
    excitedStatePopulation: 0.015
}, {
    id: 'ibm_canary',
    name: 'IBM Canary (2019 era, 5 qubit)',
    provider: 'IBM Quantum',
    description: 'An early public device. Useful for seeing how much hardware has improved.',
    source: 'Approximate median values from published IBM Quantum calibration data',
    t1Us: 70,
    t2Us: 55,
    singleQubitErrorRate: 6e-4,
    singleQubitGateTimeNs: 71,
    readoutError0as1: 0.020,
    readoutError1as0: 0.045,
    readoutTimeUs: 4.0,
    excitedStatePopulation: 0.02
}, {
    id: 'rigetti_ankaa',
    name: 'Rigetti Ankaa class',
    provider: 'Rigetti',
    description: 'Superconducting processor with fast gates and shorter coherence times.',
    source: 'Approximate values from publicly reported Rigetti specifications',
    t1Us: 22,
    t2Us: 18,
    singleQubitErrorRate: 1.5e-3,
    singleQubitGateTimeNs: 40,
    readoutError0as1: 0.030,
    readoutError1as0: 0.060,
    readoutTimeUs: 2.0,
    excitedStatePopulation: 0.02
}, {
    id: 'ionq_aria',
    name: 'IonQ Aria class (trapped ion)',
    provider: 'IonQ',
    description: 'Trapped ion qubit: coherence measured in seconds, but gates are ~1000x slower.',
    source: 'Approximate values from publicly reported IonQ specifications',
    t1Us: 1e7,
    t2Us: 1e6,
    singleQubitErrorRate: 4e-4,
    singleQubitGateTimeNs: 135000,
    readoutError0as1: 0.004,
    readoutError1as0: 0.006,
    readoutTimeUs: 150
}, {
    id: 'quantinuum_h1',
    name: 'Quantinuum H1 class (trapped ion)',
    provider: 'Quantinuum',
    description: 'Trapped ion with very low single qubit error and very long coherence.',
    source: 'Approximate values from publicly reported Quantinuum specifications',
    t1Us: 6e7,
    t2Us: 3e6,
    singleQubitErrorRate: 4e-5,
    singleQubitGateTimeNs: 25000,
    readoutError0as1: 0.002,
    readoutError1as0: 0.004,
    readoutTimeUs: 100
}, {
    id: 'demo',
    name: 'Teaching demo (exaggerated noise)',
    provider: 'Not a real device',
    description: 'Deliberately terrible qubit so every effect is obvious after a couple of gates.',
    source: 'Synthetic',
    t1Us: 0.6,
    t2Us: 0.35,
    singleQubitErrorRate: 0.02,
    singleQubitGateTimeNs: 50,
    readoutError0as1: 0.04,
    readoutError1as0: 0.07,
    readoutTimeUs: 1.0,
    excitedStatePopulation: 0.03
}];

NoiseModel.fromPreset = function(id) {
    for (var i = 0; i < NoiseModel.PRESETS.length; i++) {
        if (NoiseModel.PRESETS[i].id === id) {
            return new NoiseModel(NoiseModel.PRESETS[i]);
        }
    }
    return new NoiseModel(NoiseModel.PRESETS[0]);
};

/*
 * Calibration file loading.
 *
 * Two shapes are understood:
 *
 * 1. The simple schema this app writes, see NoiseModel.toJSON().
 *
 * 2. Qiskit backend properties, i.e. the result of
 *        backend.properties().to_dict()
 *    which is how IBM Quantum publishes per qubit calibration data. Every
 *    physical qubit in the file becomes a selectable entry.
 */
var NoiseModelLoader = {
    /**
     * Parses calibration JSON and returns an array of
     * {label, model} entries, one per physical qubit found.
     */
    parse: function(json) {
        var data = (typeof json === 'string') ? JSON.parse(json) : json;

        if (Array.isArray(data)) {
            var combined = [];
            for (var i = 0; i < data.length; i++) {
                combined = combined.concat(NoiseModelLoader.parse(data[i]));
            }
            return combined;
        }

        if (data && Array.isArray(data.qubits)) {
            return NoiseModelLoader.parseBackendProperties(data);
        }

        if (data && (data.t1Us !== undefined || data.T1 !== undefined || data.t1 !== undefined)) {
            return NoiseModelLoader.parseSimpleSchema(data);
        }

        throw new Error('Unrecognised calibration format. Expected Qiskit backend properties ' +
            '(an object with a "qubits" array) or this application\'s own noise model schema.');
    },

    parseSimpleSchema: function(data) {
        var model = new NoiseModel({
            id: 'file',
            name: data.name || 'Loaded noise model',
            provider: data.provider || 'Loaded from file',
            description: data.description || '',
            source: data.source || 'Loaded from file',
            t1Us: NoiseModel.number(data.t1Us, NoiseModel.number(data.T1, data.t1)),
            t2Us: NoiseModel.number(data.t2Us, NoiseModel.number(data.T2, data.t2)),
            singleQubitErrorRate: data.singleQubitErrorRate,
            singleQubitGateTimeNs: data.singleQubitGateTimeNs,
            readoutError0as1: data.readoutError0as1,
            readoutError1as0: data.readoutError1as0,
            readoutTimeUs: data.readoutTimeUs,
            excitedStatePopulation: data.excitedStatePopulation,
            virtualZ: data.virtualZ
        });
        return [{ label: model.name, model: model }];
    },

    /** Reads a "T1"/"T2"/"readout_error" style property list for one qubit. */
    readQubitProperty: function(properties, name) {
        for (var i = 0; i < properties.length; i++) {
            if (properties[i] && properties[i].name === name) {
                return properties[i];
            }
        }
        return null;
    },

    /** Converts a {value, unit} pair to microseconds. */
    toMicroseconds: function(property, fallback) {
        if (!property || typeof property.value !== 'number') return fallback;

        var unit = (property.unit || 'us').toLowerCase();
        var factors = { s: 1e6, ms: 1e3, us: 1, 'µs': 1, ns: 1e-3 };
        var factor = factors[unit];
        return property.value * (factor === undefined ? 1 : factor);
    },

    /** Converts a {value, unit} pair to nanoseconds. */
    toNanoseconds: function(property, fallback) {
        if (!property || typeof property.value !== 'number') return fallback;

        var unit = (property.unit || 'ns').toLowerCase();
        var factors = { s: 1e9, ms: 1e6, us: 1e3, 'µs': 1e3, ns: 1 };
        var factor = factors[unit];
        return property.value * (factor === undefined ? 1 : factor);
    },

    parseBackendProperties: function(data) {
        var backendName = data.backend_name || 'Loaded backend';
        var updated = data.last_update_date ? String(data.last_update_date).substring(0, 10) : '';
        var entries = [];

        // Index the single qubit gate data by qubit so it can be picked up below.
        var gateData = {};
        var gates = Array.isArray(data.gates) ? data.gates : [];
        var preferredGates = ['sx', 'x', 'rx', 'u2', 'u3', 'u'];

        for (var g = 0; g < gates.length; g++) {
            var gate = gates[g];
            if (!gate || !Array.isArray(gate.qubits) || gate.qubits.length !== 1) continue;

            var gateName = String(gate.gate || '').toLowerCase();
            var rank = preferredGates.indexOf(gateName);
            if (rank < 0) continue;

            var qubit = gate.qubits[0];
            var existing = gateData[qubit];
            if (existing && existing.rank <= rank) continue;

            var parameters = Array.isArray(gate.parameters) ? gate.parameters : [];
            gateData[qubit] = {
                rank: rank,
                name: gateName,
                error: NoiseModel.number(
                    (NoiseModelLoader.readQubitProperty(parameters, 'gate_error') || {}).value, undefined),
                lengthNs: NoiseModelLoader.toNanoseconds(
                    NoiseModelLoader.readQubitProperty(parameters, 'gate_length'), undefined)
            };
        }

        for (var q = 0; q < data.qubits.length; q++) {
            var properties = data.qubits[q];
            if (!Array.isArray(properties)) continue;

            var t1 = NoiseModelLoader.toMicroseconds(
                NoiseModelLoader.readQubitProperty(properties, 'T1'), 100);
            var t2 = NoiseModelLoader.toMicroseconds(
                NoiseModelLoader.readQubitProperty(properties, 'T2'), 100);

            var prepared0as1 = NoiseModelLoader.readQubitProperty(properties, 'prob_meas1_prep0');
            var prepared1as0 = NoiseModelLoader.readQubitProperty(properties, 'prob_meas0_prep1');
            var readout = NoiseModelLoader.readQubitProperty(properties, 'readout_error');
            var symmetricReadout = readout ? NoiseModel.number(readout.value, 0) : 0;

            var thermal = NoiseModelLoader.readQubitProperty(properties, 'excited_state_population')
                || NoiseModelLoader.readQubitProperty(properties, 'prob_meas1_prep0_thermal');

            var perQubitGate = gateData[q] || {};

            var model = new NoiseModel({
                id: 'file_q' + q,
                name: backendName + ' - qubit ' + q,
                provider: 'Loaded calibration data',
                description: 'T1/T2 and ' + (perQubitGate.name || 'single qubit gate') +
                    ' error read from ' + backendName +
                    (updated ? ' (calibrated ' + updated + ')' : ''),
                source: 'Qiskit backend properties file',
                t1Us: t1,
                t2Us: t2,
                singleQubitErrorRate: NoiseModel.number(perQubitGate.error, 2.5e-4),
                singleQubitGateTimeNs: NoiseModel.number(perQubitGate.lengthNs, 35),
                readoutError0as1: prepared0as1 ?
                    NoiseModel.number(prepared0as1.value, symmetricReadout) : symmetricReadout,
                readoutError1as0: prepared1as0 ?
                    NoiseModel.number(prepared1as0.value, symmetricReadout) : symmetricReadout,
                readoutTimeUs: NoiseModelLoader.toMicroseconds(
                    NoiseModelLoader.readQubitProperty(properties, 'readout_length'), 0),
                excitedStatePopulation: thermal ? NoiseModel.number(thermal.value, 0) : 0
            });

            entries.push({
                // Reads back the model rather than the file, so the label shows
                // the values actually in use after any clamping.
                label: 'Qubit ' + q +
                    '  (T1 ' + model.t1Us.toFixed(0) + 'µs, T2 ' + model.t2Us.toFixed(0) + 'µs, err ' +
                    (model.singleQubitErrorRate * 100).toFixed(3) + '%)',
                model: model
            });
        }

        if (entries.length === 0) {
            throw new Error('No qubit calibration entries found in the file.');
        }
        return entries;
    }
};
