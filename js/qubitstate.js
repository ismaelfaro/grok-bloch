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
 * Single qubit state held as a Bloch vector, which is equivalent to the
 * density matrix
 *
 *     rho = (I + x*sigma_x + y*sigma_y + z*sigma_z) / 2
 *
 * A pure state sits on the surface (|r| == 1). Decoherence pulls the vector
 * towards the centre, which is exactly what makes noise visible on the sphere,
 * so the whole simulator works in this representation rather than with
 * probability amplitudes.
 *
 * Mapping to the Babylon coordinates used by BlochSphere:
 *     babylon = (y, z, -x)
 */

/** Minimal complex helpers so the code does not depend on a mathjs version. */
var Cx = {
    of: function(value) {
        if (value === null || value === undefined) return { re: 0, im: 0 };
        if (typeof value === 'number') return { re: value, im: 0 };
        return { re: value.re || 0, im: value.im || 0 };
    },
    add: function(a, b) {
        return { re: a.re + b.re, im: a.im + b.im };
    },
    sub: function(a, b) {
        return { re: a.re - b.re, im: a.im - b.im };
    },
    mul: function(a, b) {
        return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
    },
    scale: function(a, s) {
        return { re: a.re * s, im: a.im * s };
    },
    conj: function(a) {
        return { re: a.re, im: -a.im };
    },
    abs: function(a) {
        return Math.sqrt(a.re * a.re + a.im * a.im);
    },
    /** Principal square root of a complex number. */
    sqrt: function(a) {
        var modulus = Math.sqrt(Cx.abs(a));
        var argument = Math.atan2(a.im, a.re) / 2;
        return { re: modulus * Math.cos(argument), im: modulus * Math.sin(argument) };
    },
    div: function(a, b) {
        var denominator = b.re * b.re + b.im * b.im;
        if (denominator === 0) return { re: 0, im: 0 };
        return {
            re: (a.re * b.re + a.im * b.im) / denominator,
            im: (a.im * b.re - a.re * b.im) / denominator
        };
    }
};

/** Multiplies two 2x2 matrices of complex numbers. */
function matrixMultiply2x2(a, b) {
    var product = [
        [null, null],
        [null, null]
    ];
    for (var row = 0; row < 2; row++) {
        for (var col = 0; col < 2; col++) {
            var sum = { re: 0, im: 0 };
            for (var k = 0; k < 2; k++) {
                sum = Cx.add(sum, Cx.mul(a[row][k], b[k][col]));
            }
            product[row][col] = sum;
        }
    }
    return product;
}

/** Conjugate transpose of a 2x2 matrix of complex numbers. */
function matrixDagger2x2(a) {
    return [
        [Cx.conj(a[0][0]), Cx.conj(a[1][0])],
        [Cx.conj(a[0][1]), Cx.conj(a[1][1])]
    ];
}

/**
 * Decomposes a 2x2 unitary into the rotation it performs on the Bloch sphere.
 * Any single qubit unitary is, up to global phase,
 *
 *     U = exp(-i * angle/2 * (axis . sigma))
 *
 * so this returns {axis: {x, y, z}, angle}. Used to model coherent
 * (systematic) over/under rotation errors, which is a rotation error rather
 * than decoherence: the state stays pure but drifts off target.
 */
function unitaryToAxisAngle(u) {
    var determinant = Cx.sub(Cx.mul(u[0][0], u[1][1]), Cx.mul(u[0][1], u[1][0]));
    var phase = Cx.sqrt(determinant);
    var v = [
        [Cx.div(u[0][0], phase), Cx.div(u[0][1], phase)],
        [Cx.div(u[1][0], phase), Cx.div(u[1][1], phase)]
    ];

    var cosHalf = (v[0][0].re + v[1][1].re) / 2;
    // The components below equal sin(angle/2) * axis
    var wx = -Cx.scale(Cx.add(v[0][1], v[1][0]), 0.5).im;
    var wy = Cx.scale(Cx.sub(v[1][0], v[0][1]), 0.5).re;
    var wz = -Cx.scale(Cx.sub(v[0][0], v[1][1]), 0.5).im;

    var sinHalf = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (sinHalf < 1e-12) {
        return { axis: { x: 0, y: 0, z: 1 }, angle: 0 };
    }
    return {
        axis: { x: wx / sinHalf, y: wy / sinHalf, z: wz / sinHalf },
        angle: 2 * Math.atan2(sinHalf, cosHalf)
    };
}

class QubitState {
    constructor(x, y, z) {
        this.x = x === undefined ? 0 : x;
        this.y = y === undefined ? 0 : y;
        this.z = z === undefined ? 1 : z;
    }

    static zeroState() {
        return new QubitState(0, 0, 1);
    }

    static oneState() {
        return new QubitState(0, 0, -1);
    }

    /** Builds a pure state from the spherical angles used by the Bloch sphere. */
    static fromAngles(inclinationRadians, azimuthRadians) {
        return new QubitState(
            Math.sin(inclinationRadians) * Math.cos(azimuthRadians),
            Math.sin(inclinationRadians) * Math.sin(azimuthRadians),
            Math.cos(inclinationRadians));
    }

    clone() {
        return new QubitState(this.x, this.y, this.z);
    }

    copyFrom(other) {
        this.x = other.x;
        this.y = other.y;
        this.z = other.z;
        return this;
    }

    /** Length of the Bloch vector: 1 for a pure state, 0 for a maximally mixed one. */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /** Tr(rho^2), which runs from 0.5 (fully mixed) to 1 (pure). */
    purity() {
        var r = this.length();
        return (1 + r * r) / 2;
    }

    probability0() {
        return (1 + this.z) / 2;
    }

    probability1() {
        return (1 - this.z) / 2;
    }

    inclinationRadians() {
        var r = this.length();
        if (r < 1e-12) return 0;
        return Math.acos(Math.max(-1, Math.min(1, this.z / r)));
    }

    azimuthRadians() {
        if (Math.abs(this.x) < 1e-12 && Math.abs(this.y) < 1e-12) return 0;
        return (Math.atan2(this.y, this.x) + Math.PI * 2) % (Math.PI * 2);
    }

    /** Applies a unitary as rho -> U rho U-dagger. */
    applyUnitary(u) {
        var rho = this.densityMatrix();
        var evolved = matrixMultiply2x2(matrixMultiply2x2(u, rho), matrixDagger2x2(u));
        this.x = 2 * evolved[0][1].re;
        this.y = -2 * evolved[0][1].im;
        this.z = evolved[0][0].re - evolved[1][1].re;
        return this;
    }

    /** Rotates the Bloch vector about an axis (Rodrigues' rotation formula). */
    rotateAbout(axis, angle) {
        var norm = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
        if (norm < 1e-12 || angle === 0) return this;

        var nx = axis.x / norm;
        var ny = axis.y / norm;
        var nz = axis.z / norm;
        var cos = Math.cos(angle);
        var sin = Math.sin(angle);
        var dot = nx * this.x + ny * this.y + nz * this.z;

        var crossX = ny * this.z - nz * this.y;
        var crossY = nz * this.x - nx * this.z;
        var crossZ = nx * this.y - ny * this.x;

        var rotatedX = this.x * cos + crossX * sin + nx * dot * (1 - cos);
        var rotatedY = this.y * cos + crossY * sin + ny * dot * (1 - cos);
        var rotatedZ = this.z * cos + crossZ * sin + nz * dot * (1 - cos);

        this.x = rotatedX;
        this.y = rotatedY;
        this.z = rotatedZ;
        return this;
    }

    /**
     * Applies an affine (Pauli transfer) channel to the Bloch vector:
     *     x -> ax*x,  y -> ay*y,  z -> az*z + cz
     * Every noise channel used by this simulator has this form.
     */
    applyChannel(channel) {
        this.x *= channel.ax;
        this.y *= channel.ay;
        this.z = this.z * channel.az + (channel.cz || 0);
        return this;
    }

    /** Uniform contraction towards the centre, i.e. the depolarizing channel. */
    contract(factor) {
        this.x *= factor;
        this.y *= factor;
        this.z *= factor;
        return this;
    }

    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    /**
     * Uhlmann fidelity squared between two single qubit states. When the target
     * is pure this reduces to <psi|rho|psi>, the usual state fidelity.
     */
    fidelityWith(other) {
        var r1 = this.length();
        var r2 = other.length();
        var cross = Math.max(0, (1 - r1 * r1) * (1 - r2 * r2));
        var fidelity = (1 + this.dot(other) + Math.sqrt(cross)) / 2;
        return Math.max(0, Math.min(1, fidelity));
    }

    /** Trace distance, an alternative "how far off am I" measure. */
    traceDistanceTo(other) {
        var dx = this.x - other.x;
        var dy = this.y - other.y;
        var dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
    }

    densityMatrix() {
        return [
            [Cx.of((1 + this.z) / 2), { re: this.x / 2, im: -this.y / 2 }],
            [{ re: this.x / 2, im: this.y / 2 }, Cx.of((1 - this.z) / 2)]
        ];
    }

    /** Probability amplitudes of the closest pure state (meaningless global phase removed). */
    probAmplitudes() {
        var inclination = this.inclinationRadians();
        var azimuth = this.azimuthRadians();
        return {
            amp0: math.complex(Math.cos(inclination / 2), 0),
            amp1: math.multiply(
                math.complex(Math.cos(azimuth), Math.sin(azimuth)),
                Math.sin(inclination / 2))
        };
    }
}

/** Converts a Gate's mathjs matrix into a plain 2x2 array of complex numbers. */
function gateComplexMatrix(gate) {
    if (gate.complexMatrix) return gate.complexMatrix;

    var matrix = [
        [null, null],
        [null, null]
    ];
    for (var row = 0; row < 2; row++) {
        for (var col = 0; col < 2; col++) {
            matrix[row][col] = Cx.of(math.subset(gate.matrix, math.index(row, col)));
        }
    }
    gate.complexMatrix = matrix;
    return matrix;
}
