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
 * Runs gates on a single qubit twice over: once perfectly, and once through the
 * selected noise model. The perfect run is the reference the noisy one is
 * scored against, and it is drawn on the sphere as a ghost arrow.
 *
 * Every gate the user applies is recorded into a small program, which the
 * transport controls (run / step / stop) can replay.
 */
class NoisySimulator {
    constructor(blochSphere) {
        this.blochSphere = blochSphere;

        this.state = QubitState.zeroState();
        this.idealState = QubitState.zeroState();
        this.initialState = QubitState.zeroState();

        this.model = NoiseModel.fromPreset('ideal');
        this.enabled = false;

        // Multiplies every error rate and decoherence rate. Real single qubit
        // gates are so good that a handful of them changes nothing visible, so
        // this is the knob that makes the physics observable in a demo.
        this.noiseScale = 1;

        // Idle window inserted after each gate, in microseconds. Decoherence
        // during idle time is usually the dominant error in a real circuit.
        this.idleTimeUs = 0;

        // Systematic over rotation, as a fraction of each gate's rotation
        // angle. Unlike decoherence this keeps the state pure: the arrow stays
        // on the surface but lands in the wrong place.
        this.coherentOverRotation = 0;

        this.program = [];
        this.programCounter = 0;
        this.playing = false;
        this.loop = false;
        this.stepIntervalMs = 600;
        this.timer = null;

        this.gatesExecuted = 0;
        this.elapsedUs = 0;
        this.lastRunFidelity = null;
        this.bestRunFidelity = null;
        this.shots = null;

        this.listeners = [];
        this.syncBlochSphere();
    }

    /** Registers a callback fired whenever the state or the settings change. */
    addChangeListener(listener) {
        this.listeners.push(listener);
    }

    setNoiseModel(model) {
        this.model = model;
        this.notify();
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            // Without noise the two runs are the same state again.
            this.state.copyFrom(this.idealState);
        }
        this.syncBlochSphere();
    }

    setNoiseScale(scale) {
        this.noiseScale = scale;
        this.notify();
    }

    setIdleTimeUs(idleTimeUs) {
        this.idleTimeUs = idleTimeUs;
        this.notify();
    }

    setCoherentOverRotation(fraction) {
        this.coherentOverRotation = fraction;
        this.notify();
    }

    /** True when the noisy state has drifted away from the ideal one. */
    isPerturbed() {
        return this.enabled && this.fidelity() < 0.9999;
    }

    fidelity() {
        return this.state.fidelityWith(this.idealState);
    }

    /** Score out of 100: the state fidelity against the noiseless result. */
    score() {
        return this.fidelity() * 100;
    }

    grade() {
        var fidelity = this.fidelity();
        if (fidelity >= 0.9999) return { letter: 'A+', className: 'grade-a' };
        if (fidelity >= 0.999) return { letter: 'A', className: 'grade-a' };
        if (fidelity >= 0.99) return { letter: 'B', className: 'grade-b' };
        if (fidelity >= 0.95) return { letter: 'C', className: 'grade-c' };
        if (fidelity >= 0.90) return { letter: 'D', className: 'grade-d' };
        return { letter: 'F', className: 'grade-f' };
    }

    /////// State preparation

    /** Prepares a state directly, which also starts a new program. */
    prepareState(qubitState, options) {
        options = options || {};
        this.stopPlayback();

        this.initialState = qubitState.clone();
        this.state = qubitState.clone();
        this.idealState = qubitState.clone();

        if (!options.keepProgram) {
            this.program = [];
        }
        this.programCounter = 0;
        this.gatesExecuted = 0;
        this.elapsedUs = 0;
        this.shots = null;

        this.syncBlochSphere();
    }

    prepareFromAngles(inclinationRadians, azimuthRadians) {
        this.prepareState(QubitState.fromAngles(inclinationRadians, azimuthRadians));
    }

    /** Rewinds to the start of the program without discarding it. */
    rewind() {
        this.state = this.initialState.clone();
        this.idealState = this.initialState.clone();
        this.programCounter = 0;
        this.gatesExecuted = 0;
        this.elapsedUs = 0;
        this.shots = null;
        this.syncBlochSphere();
    }

    clearProgram() {
        this.stopPlayback();
        this.program = [];
        this.lastRunFidelity = null;
        this.bestRunFidelity = null;
        this.rewind();
    }

    /////// Gate execution

    /**
     * Applies a gate now and appends it to the program. This is what the gate
     * buttons on the sphere call, so interactive clicking is itself a noisy
     * run rather than a separate mode.
     */
    applyGate(gate) {
        this.stopPlayback();
        this.program.push(gate);
        this.programCounter = this.program.length;
        this.executeGate(gate);
    }

    /** Runs one gate through both the ideal and the noisy state. */
    executeGate(gate) {
        var unitary = gateComplexMatrix(gate);

        this.idealState.applyUnitary(unitary);
        this.state.applyUnitary(unitary);

        if (this.enabled) {
            var pulses = this.model.pulseCount(gate);

            if (pulses > 0 && this.coherentOverRotation !== 0) {
                var rotation = unitaryToAxisAngle(unitary);
                this.state.rotateAbout(rotation.axis, rotation.angle * this.coherentOverRotation);
            }

            var gateDurationUs = this.model.gateDurationUs(pulses);
            if (gateDurationUs > 0) {
                this.state.applyChannel(this.model.relaxationChannel(gateDurationUs, this.noiseScale));
            }

            var depolarizing = this.model.depolarizingParameter(pulses, gateDurationUs, this.noiseScale);
            if (depolarizing > 0) {
                this.state.contract(1 - depolarizing);
            }

            this.elapsedUs += gateDurationUs;

            if (this.idleTimeUs > 0) {
                this.state.applyChannel(this.model.relaxationChannel(this.idleTimeUs, this.noiseScale));
                this.elapsedUs += this.idleTimeUs;
            }
        }

        this.gatesExecuted++;
        this.shots = null;
        this.syncBlochSphere();
    }

    /** Lets the qubit sit idle so pure decoherence can be watched on its own. */
    idle(durationUs) {
        if (this.enabled && durationUs > 0) {
            this.state.applyChannel(this.model.relaxationChannel(durationUs, this.noiseScale));
            this.elapsedUs += durationUs;
            this.shots = null;
            this.syncBlochSphere();
        }
    }

    /////// Transport

    /** Executes the next gate in the program, rewinding first if it has ended. */
    step() {
        if (this.program.length === 0) return false;

        if (this.programCounter >= this.program.length) {
            this.rewind();
        }
        this.executeGate(this.program[this.programCounter]);
        this.programCounter++;

        if (this.programCounter >= this.program.length) {
            this.recordRunResult();
        }
        return true;
    }

    play() {
        if (this.program.length === 0 || this.playing) return;

        if (this.programCounter >= this.program.length) {
            this.rewind();
        }
        this.playing = true;
        this.notify();
        this.scheduleNextStep();
    }

    scheduleNextStep() {
        var simulator = this;
        this.timer = setTimeout(function() {
            if (!simulator.playing) return;

            simulator.executeGate(simulator.program[simulator.programCounter]);
            simulator.programCounter++;

            if (simulator.programCounter >= simulator.program.length) {
                simulator.recordRunResult();
                if (simulator.loop) {
                    simulator.rewind();
                } else {
                    simulator.playing = false;
                    simulator.notify();
                    return;
                }
            }
            simulator.scheduleNextStep();
        }, this.stepIntervalMs);
    }

    /** Pauses playback but keeps the current state on the sphere. */
    pause() {
        this.stopPlayback();
        this.notify();
    }

    /** Stops and rewinds to the prepared state. */
    stop() {
        this.stopPlayback();
        this.rewind();
    }

    stopPlayback() {
        this.playing = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    recordRunResult() {
        var fidelity = this.fidelity();
        this.lastRunFidelity = fidelity;
        if (this.bestRunFidelity === null || fidelity > this.bestRunFidelity) {
            this.bestRunFidelity = fidelity;
        }
    }

    /////// Measurement

    /**
     * Samples the qubit, including readout assignment error. Returns the counts
     * and the probabilities so the readout contribution stays visible.
     */
    runShots(shotCount) {
        var trueProbability1 = this.state.probability1();
        var measuredProbability1 = this.enabled ?
            this.model.measuredProbability1(trueProbability1) : trueProbability1;

        var ones = 0;
        for (var shot = 0; shot < shotCount; shot++) {
            if (Math.random() < measuredProbability1) ones++;
        }

        this.shots = {
            total: shotCount,
            zeros: shotCount - ones,
            ones: ones,
            idealProbability1: this.idealState.probability1(),
            trueProbability1: trueProbability1,
            measuredProbability1: measuredProbability1
        };
        this.notify();
        return this.shots;
    }

    /////// Wiring to the 3D scene

    syncBlochSphere() {
        if (this.blochSphere) {
            this.blochSphere.setBlochVector(this.state.x, this.state.y, this.state.z);
            this.blochSphere.setIdealBlochVector(
                this.idealState.x, this.idealState.y, this.idealState.z);
            this.blochSphere.setShowIdealVector(this.isPerturbed());
        }
        this.notify();
    }

    notify() {
        for (var i = 0; i < this.listeners.length; i++) {
            this.listeners[i](this);
        }
    }
}
