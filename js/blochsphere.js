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
class BlochSphere extends BABYLON.Mesh {
    constructor(name, scene, inclinationRadians, azimuthRadians) {
        super(name, scene);
        this.inclinationRadians = inclinationRadians;
        this.azimuthRadians = azimuthRadians;
        this.probAmplitude0 = math.complex(1, 0);
        this.probAmplitude1 = math.complex(0, 0);

        // Bloch vector of the state actually being displayed. A pure state has
        // length 1 and touches the surface; a decohered (mixed) state is
        // shorter and its arrow ends inside the sphere.
        this.blochVector = { x: 0, y: 0, z: 1 };
        this.stateVectorLength = 1;

        // Where the state would have been without noise, drawn as a ghost arrow.
        this.idealBlochVector = { x: 0, y: 0, z: 1 };
        this.showIdealVector = false;

        this.scene = scene;
        this.sphere = BABYLON.MeshBuilder.CreateSphere("sphere", { diameterX: 2.0, diameterY: 2.0, diameterZ: 2.0 }, scene);
        this.lineColor = new BABYLON.Color3(.3, .3, .3);

        this.quantumStateArrow = null;
        this.quantumStateArrowColor = new BABYLON.Color3(0, 0, 1);
        this.idealStateArrow = null;
        this.idealStateArrowColor = new BABYLON.Color3(0.85, 0.35, 0.0);

        this.allowMultipleStateLines = false;

        this.setupSphere();
    }

    setCartesianCoords(babylonAxesVector) {
        var babylonAxisX = babylonAxesVector.x;
        var babylonAxisY = babylonAxesVector.y;
        var babylonAxisZ = babylonAxesVector.z;

        this.setInclinationRadians(Math.acos(babylonAxisY));

        if (babylonAxisZ <= 0) {
            this.setAzimuthRadians((Math.atan(babylonAxisX / -babylonAxisZ) + Math.PI * 2) % (Math.PI * 2));
        } else {
            this.setAzimuthRadians((Math.atan(babylonAxisX / -babylonAxisZ) + Math.PI) % (Math.PI * 2));
        }
    }

    getCartesianCoords() {
        var babylonAxisX = Math.sin(this.inclinationRadians) *
            Math.sin(this.azimuthRadians);
        var babylonAxisY = Math.cos(this.inclinationRadians);
        var babylonAxisZ = -Math.sin(this.inclinationRadians) *
            Math.cos(this.azimuthRadians);

        return new BABYLON.Vector3(babylonAxisX, babylonAxisY, babylonAxisZ);
    }

    setProbAmplitudes(probAmp0, probAmp1) {
        this.probAmplitude0 = probAmp0;
        this.probAmplitude1 = probAmp1;

        var inclRads = 2 * math.acos(math.abs(probAmp0));
        this.setInclinationRadians(inclRads);

        var probAmp0Polar = probAmp0.toPolar();
        var probAmp1Polar = probAmp1.toPolar();
        var azimRads = (probAmp1.toPolar().phi - probAmp0.toPolar().phi);

        this.setAzimuthRadians(azimRads);
    }

    /**
     * Displays a state given by its Bloch vector, which unlike probability
     * amplitudes can also describe a mixed state produced by noise. Vectors
     * shorter than 1 shrink the arrow towards the centre of the sphere.
     */
    setBlochVector(x, y, z) {
        this.blochVector = { x: x, y: y, z: z };

        var length = Math.sqrt(x * x + y * y + z * z);
        this.stateVectorLength = Math.min(1, length);

        if (length < 1e-9) {
            this.inclinationRadians = 0;
            this.azimuthRadians = 0;
        } else {
            this.inclinationRadians = Math.acos(Math.max(-1, Math.min(1, z / length)));
            this.azimuthRadians = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        }

        this.resetGlobalPhase();
        this.updateQuantumStateArrow();
    }

    getBlochVector() {
        return this.blochVector;
    }

    setIdealBlochVector(x, y, z) {
        this.idealBlochVector = { x: x, y: y, z: z };
        this.updateIdealStateArrow();
    }

    setShowIdealVector(showIdealVector) {
        this.showIdealVector = showIdealVector;
        this.updateIdealStateArrow();
    }

    /** Keeps the Bloch vector in step with the spherical angles (pure state). */
    syncBlochVectorFromAngles() {
        var inclination = this.inclinationRadians;
        var azimuth = this.azimuthRadians;
        this.blochVector = {
            x: Math.sin(inclination) * Math.cos(azimuth),
            y: Math.sin(inclination) * Math.sin(azimuth),
            z: Math.cos(inclination)
        };
        this.stateVectorLength = 1;
    }

    // TODO: Combine both probAmplitude methods
    getProbAmplitude0() {
        // var probAmpComplex = math.complex(Math.cos(this.getInclinationRadians() / 2), 0);
        // return math.round(probAmpComplex, 4);
        return this.probAmplitude0;
    }

    getProbAmplitude1() {
        // var sinHalfIncl = Math.sin(this.getInclinationRadians() / 2);
        // var probAmpComplex = math.multiply(
        //     math.complex(Math.cos(this.getAzimuthRadians()),
        //                  Math.sin(this.getAzimuthRadians())),
        //     sinHalfIncl);
        // return math.round(probAmpComplex, 4);
        return this.probAmplitude1;
    }

    // Measurement probabilities come from the Bloch vector rather than from the
    // amplitudes, because a mixed state has no amplitudes of its own.
    getProbability0() {
        return Math.max(0, Math.min(1, (1 + this.blochVector.z) / 2));
    }

    getProbability1() {
        return Math.max(0, Math.min(1, (1 - this.blochVector.z) / 2));
    }

    /** Tr(rho^2): 1 for a pure state, 0.5 for a completely decohered one. */
    getPurity() {
        var length = this.stateVectorLength;
        return (1 + length * length) / 2;
    }

    setInclinationRadians(inclinationRadians) {
        this.inclinationRadians = inclinationRadians;
        this.syncBlochVectorFromAngles();
        this.updateQuantumStateArrow();
    }

    getInclinationRadians() {
        return this.inclinationRadians;
    }

    setAzimuthRadians(azimuthRadians) {
        this.azimuthRadians = (azimuthRadians + Math.PI * 2) % (Math.PI * 2);
        this.syncBlochVectorFromAngles();
        this.updateQuantumStateArrow();
    }

    getAzimuthRadians() {
        // If quantum state is [0> there is no phase
        if (this.inclinationRadians < 0.000001) {
            this.azimuthRadians = 0;
        }

        return this.azimuthRadians % (Math.PI * 2);
    }

    setAllowMultipleStateLines(allowMultipleStateLines) {
        this.allowMultipleStateLines = allowMultipleStateLines;
    }

    applyGate(gate) {
        var currentQuantumState = math.matrix([
            [this.getProbAmplitude0()],
            [this.getProbAmplitude1()]
        ]);
        var newQuantumState = math.multiply(gate.matrix, currentQuantumState);

        var probAmp0 = math.subset(newQuantumState, math.index(0, 0));
        var probAmp1 = math.subset(newQuantumState, math.index(1, 0));

        this.setProbAmplitudes(probAmp0, probAmp1);
    }

    /**
     * Recomputes the amplitudes from the spherical angles, dropping the
     * unobservable global phase. It deliberately does not go through
     * setProbAmplitudes(), so that the length of the Bloch vector, and with it
     * the purity of a noisy state, is preserved.
     */
    resetGlobalPhase() {
        this.probAmplitude0 = math.complex(Math.cos(this.getInclinationRadians() / 2), 0);
        var sinHalfIncl = Math.sin(this.getInclinationRadians() / 2);
        this.probAmplitude1 = math.multiply(
            math.complex(Math.cos(this.getAzimuthRadians()),
                Math.sin(this.getAzimuthRadians())),
            sinHalfIncl);
    }

    /// Methods to construct the 3D Bloch sphere
    setupSphere() {
        var myMaterial = new BABYLON.StandardMaterial("myMaterial", this.scene);
        myMaterial.specularColor = new BABYLON.Color3(0.0, 0.0, 0.0);
        myMaterial.alpha = 0.4;
        
        this.sphere.material = myMaterial;
        this.position.y = 0.0;
        this.sphere.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);

        var equator = this.createEquator();
        equator.parent = this.sphere;
        equator.color = this.lineColor;

        //Array of points to construct Bloch X axis line
        var xAxisPoints = [
            new BABYLON.Vector3(0, 0, -1.0),
            new BABYLON.Vector3(0, 0, 1.0)
        ];

        //Array of points to construct Bloch Y axis line
        var yAxisPoints = [
            new BABYLON.Vector3(-1.0, 0, 0),
            new BABYLON.Vector3(1.0, 0, 0)
        ];

        //Array of points to construct Bloch Z axis line
        var zAxisPoints = [
            new BABYLON.Vector3(0, 1.0, 0),
            new BABYLON.Vector3(0, -1.0, 0)
        ];

        //Create lines
        var xAxisLine = BABYLON.MeshBuilder.CreateDashedLines("xAxisLine", { points: xAxisPoints, dashSize: 3, gapSize: 3 }, this.scene);
        var yAxisLine = BABYLON.MeshBuilder.CreateDashedLines("yAxisLine", { points: yAxisPoints, dashSize: 3, gapSize: 3 }, this.scene);
        var zAxisLine = BABYLON.MeshBuilder.CreateDashedLines("zAxisLine", { points: zAxisPoints, dashSize: 3, gapSize: 3 }, this.scene);

        xAxisLine.color = this.lineColor;
        yAxisLine.color = this.lineColor;
        zAxisLine.color = this.lineColor;

        xAxisLine.isPickable = false;
        yAxisLine.isPickable = false;
        zAxisLine.isPickable = false;

        xAxisLine.parent = this.sphere;
        yAxisLine.parent = this.sphere;
        zAxisLine.parent = this.sphere;

        // Axis labels
        var xChar = this.makeTextPlane("X", "black", 0.2);
        xChar.position = new BABYLON.Vector3(0, 0.1, -1.2);
        xChar.isPickable = false;

        var yChar = this.makeTextPlane("Y", "black", 0.2);
        yChar.position = new BABYLON.Vector3(1.2, 0, 0);
        yChar.isPickable = false;

        var zeroKet = this.makeTextPlane("|0⟩", "black", 0.2);
        zeroKet.position = new BABYLON.Vector3(0, 1.2, 0);
        zeroKet.isPickable = false;

        var oneKet = this.makeTextPlane("|1⟩", "black", 0.2);
        oneKet.position = new BABYLON.Vector3(0, -1.2, 0);
        oneKet.isPickable = false;

        var plusKet = this.makeTextPlane("|+⟩", "black", 0.2);
        plusKet.position = new BABYLON.Vector3(0, -0.1, -1.2);
        plusKet.isPickable = false;
        
        var minusKet = this.makeTextPlane("|-⟩", "black", 0.2);
        minusKet.position = new BABYLON.Vector3(0, 0, 1.2);
        minusKet.isPickable = false;
        
        this.quantumStateArrow = this.createStateArrow(
            new BABYLON.Color3(0.0, 0.0, 0.0), this.quantumStateArrowColor, 0.02, 0.05, 1.0);

        // Ghost arrow showing the noiseless result, hidden until noise moves
        // the real state away from it.
        this.idealStateArrow = this.createStateArrow(
            this.idealStateArrowColor, this.idealStateArrowColor, 0.012, 0.04, 0.45);
        this.idealStateArrow.root.setEnabled(false);

        this.updateQuantumStateArrow();
        this.updateIdealStateArrow();
    }

    /**
     * Builds an arrow pointing along +Y that can later be rotated into place and
     * shortened. Returns the parts so the length can be changed without
     * distorting the head.
     */
    createStateArrow(shaftColor, tipColor, shaftDiameter, ballDiameter, alpha) {
        var arrowMaterial = new BABYLON.StandardMaterial("arrowMaterial", this.scene);
        arrowMaterial.diffuseColor = shaftColor;
        arrowMaterial.specularColor = new BABYLON.Color3(0.0, 0.0, 0);
        arrowMaterial.alpha = alpha;

        var arrowPointMaterial = new BABYLON.StandardMaterial("arrowPointMaterial", this.scene);
        arrowPointMaterial.diffuseColor = tipColor;
        arrowPointMaterial.specularColor = new BABYLON.Color3(0.0, 0.0, 0);
        arrowPointMaterial.alpha = alpha;

        var arrow = BABYLON.MeshBuilder.CreateLines("qStatePoints", { points: [this.sphere.position] }, this.scene);
        arrow.isPickable = false;

        var arrowBase = BABYLON.MeshBuilder.CreateCylinder("arrowBase", { height: 1, diameter: shaftDiameter }, this.scene);
        arrowBase.isPickable = false;
        arrowBase.position = new BABYLON.Vector3(0, 0.5, 0);
        arrowBase.material = arrowMaterial;
        arrowBase.parent = arrow;

        var arrowBall = BABYLON.MeshBuilder.CreateSphere("sphere", { diameter: ballDiameter }, this.scene);
        arrowBall.isPickable = false;
        arrowBall.position = new BABYLON.Vector3(0, 1, 0);
        arrowBall.material = arrowPointMaterial;
        arrowBall.parent = arrow;

        var quantumStateLineCap = BABYLON.MeshBuilder.CreateCylinder("quantumStateLineCap", { height: 0.1, diameterTop: 0.0, diameterBottom: 0.1, subdivisions: 3 }, this.scene);
        quantumStateLineCap.material = arrowMaterial;
        quantumStateLineCap.position = new BABYLON.Vector3(0, 0.95, 0);
        quantumStateLineCap.isPickable = false;
        quantumStateLineCap.parent = arrow;

        return { root: arrow, base: arrowBase, ball: arrowBall, cap: quantumStateLineCap };
    }

    /**
     * Points an arrow along the given spherical angles and shortens it to the
     * length of the Bloch vector.
     */
    orientArrow(arrow, inclinationRadians, azimuthRadians, length) {
        if (!arrow) return;

        arrow.root.rotation = new BABYLON.Vector3(-inclinationRadians, -azimuthRadians, 0);

        var clampedLength = Math.max(0, Math.min(1, length));
        // The shaft is a unit height cylinder, so scaling it in Y sets the length.
        arrow.base.scaling.y = Math.max(clampedLength, 1e-3);
        arrow.base.position.y = clampedLength / 2;
        arrow.cap.position.y = Math.max(clampedLength - 0.05, 0);
        arrow.ball.position.y = clampedLength;

        // A fully mixed state has no direction at all, so hide the head.
        var visible = clampedLength > 0.02;
        arrow.cap.setEnabled(visible);
        arrow.ball.setEnabled(visible);
        arrow.base.setEnabled(visible);
    }
    
    createEquator() {
        var myPoints = [];
        var radius = 1;
        var deltaTheta = Math.PI / 20;
        var theta = 0;
        var Y = 0;
        for (var i = 0; i < Math.PI * 20; i++) {
            myPoints.push(new BABYLON.Vector3(radius * Math.cos(theta), Y, radius * Math.sin(theta)));
            theta += deltaTheta;
        }

        //Create lines
        var lines = BABYLON.MeshBuilder.CreateDashedLines("lines", { points: myPoints, updatable: true }, this.scene);
        lines.isPickable = false;
        return lines;
    }
    // TODO: extract it to a 3delements.js
    makeTextPlane(text, color, size) {
        var dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", 60, this.scene, true);
        dynamicTexture.hasAlpha = true;
        dynamicTexture.drawText(text, 5, 40, "bold 36px Arial", color, "transparent", true);
        var plane = new BABYLON.Mesh.CreatePlane(text, size, this.scene, true);
        plane.material = new BABYLON.StandardMaterial("TextPlaneMaterial", this.scene);
        plane.material.backFaceCulling = false;
        plane.material.specularColor = new BABYLON.Color3(0, 0, 0);
        plane.material.diffuseTexture = dynamicTexture;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        return plane;
    }

    updateQuantumStateArrow() {
        this.orientArrow(this.quantumStateArrow,
            this.getInclinationRadians(),
            this.getAzimuthRadians(),
            this.stateVectorLength);
    }

    updateIdealStateArrow() {
        if (!this.idealStateArrow) return;

        this.idealStateArrow.root.setEnabled(this.showIdealVector);
        if (!this.showIdealVector) return;

        var vector = this.idealBlochVector;
        var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
        var inclination = length < 1e-9 ? 0 :
            Math.acos(Math.max(-1, Math.min(1, vector.z / length)));
        var azimuth = (Math.atan2(vector.y, vector.x) + Math.PI * 2) % (Math.PI * 2);

        this.orientArrow(this.idealStateArrow, inclination, azimuth, Math.min(1, length));
    }

}