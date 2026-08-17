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
class Gate {
    /**
     * @param matrix 2x2 unitary
     * @param name label shown in the circuit list
     * @param type how the gate is compiled onto hardware, which decides how
     *        many physical pulses (and therefore how much noise) it costs:
     *          'pauli'    - one pulse (X, Y, H)
     *          'rotation' - an arbitrary angle rotation, two pulses
     *          'virtualz' - a Z axis rotation, free on superconducting hardware
     *          'identity' - no pulse at all
     */
    constructor(matrix, name, type) {
        this.matrix = matrix;
        this.name = name || '?';
        this.type = type || 'pauli';
    }

}

Gate.X = new Gate(math.matrix([
    [0, 1],
    [1, 0]]), 'X', 'pauli');

Gate.Y = new Gate(math.matrix([
    [0, math.complex(0, -1)],
    [math.complex(0, 1), 0]]), 'Y', 'pauli');

Gate.Z = new Gate(math.matrix([
    [1, 0],
    [0, -1]]), 'Z', 'virtualz');

Gate.H = new Gate(math.matrix([
    [1 / math.sqrt(2), 1 / math.sqrt(2)],
    [1 / math.sqrt(2), -1 / math.sqrt(2)]]), 'H', 'pauli');

Gate.S = new Gate(math.matrix([
    [1, 0],
    [0, math.complex(0, 1)]]), 'S', 'virtualz');

Gate.St = new Gate(math.matrix([
    [1, 0],
    [0, math.complex(0, -1)]]), 'S†', 'virtualz');

Gate.T = new Gate(math.matrix([
    [1, 0],
    [0, math.complex(1 / math.sqrt(2), 1 / math.sqrt(2))]]), 'T', 'virtualz');

Gate.Tt = new Gate(math.matrix([
    [1, 0],
    [0, math.complex(1 / math.sqrt(2), -1 / math.sqrt(2))]]), 'T†', 'virtualz');

Gate.RxPi8 = new Gate(math.matrix([
    [math.cos(math.pi / 16), math.multiply(math.complex(0, -1), math.sin(math.pi / 16))],
    [math.multiply(math.complex(0, -1), math.sin(math.pi / 16)), math.cos(math.pi / 16)]]), 'Rx(π/8)', 'rotation');

Gate.RyPi8 = new Gate(math.matrix([
    [math.cos(math.pi / 16), -math.sin(math.pi / 16)],
    [math.sin(math.pi / 16), math.cos(math.pi / 16)]]), 'Ry(π/8)', 'rotation');

Gate.RzPi8 = new Gate(math.matrix([
    [math.exp(math.multiply(math.complex(0, -1), math.pi / 16)), 0],
    [0, math.exp(math.multiply(math.complex(0, 1), math.pi / 16))]]), 'Rz(π/8)', 'virtualz');

Gate.RxmPi8 = new Gate(math.matrix([
    [math.cos(-math.pi / 16), math.multiply(math.complex(0, -1), math.sin(-math.pi / 16))],
    [math.multiply(math.complex(0, -1), math.sin(-math.pi / 16)), math.cos(-math.pi / 16)]]), 'Rx(-π/8)', 'rotation');

Gate.RymPi8 = new Gate(math.matrix([
    [math.cos(-math.pi / 16), -math.sin(-math.pi / 16)],
    [math.sin(-math.pi / 16), math.cos(-math.pi / 16)]]), 'Ry(-π/8)', 'rotation');

Gate.RzmPi8 = new Gate(math.matrix([
    [math.exp(math.multiply(math.complex(0, -1), -math.pi / 16)), 0],
    [0, math.exp(math.multiply(math.complex(0, 1), -math.pi / 16))]]), 'Rz(-π/8)', 'virtualz');

// Pi / 12 gates
Gate.RxPi12 = new Gate(math.matrix([
    [math.cos(math.pi / 24), math.multiply(math.complex(0, -1), math.sin(math.pi / 24))],
    [math.multiply(math.complex(0, -1), math.sin(math.pi / 24)), math.cos(math.pi / 24)]]), 'Rx(π/12)', 'rotation');

Gate.RyPi12 = new Gate(math.matrix([
    [math.cos(math.pi / 24), -math.sin(math.pi / 24)],
    [math.sin(math.pi / 24), math.cos(math.pi / 24)]]), 'Ry(π/12)', 'rotation');

Gate.RzPi12 = new Gate(math.matrix([
    [math.exp(math.multiply(math.complex(0, -1), math.pi / 24)), 0],
    [0, math.exp(math.multiply(math.complex(0, 1), math.pi / 24))]]), 'Rz(π/12)', 'virtualz');

Gate.RxmPi12 = new Gate(math.matrix([
    [math.cos(-math.pi / 24), math.multiply(math.complex(0, -1), math.sin(-math.pi / 24))],
    [math.multiply(math.complex(0, -1), math.sin(-math.pi / 24)), math.cos(-math.pi / 24)]]), 'Rx(-π/12)', 'rotation');

Gate.RymPi12 = new Gate(math.matrix([
    [math.cos(-math.pi / 24), -math.sin(-math.pi / 24)],
    [math.sin(-math.pi / 24), math.cos(-math.pi / 24)]]), 'Ry(-π/12)', 'rotation');

Gate.RzmPi12 = new Gate(math.matrix([
    [math.exp(math.multiply(math.complex(0, -1), -math.pi / 24)), 0],
    [0, math.exp(math.multiply(math.complex(0, 1), -math.pi / 24))]]), 'Rz(-π/12)', 'virtualz');

