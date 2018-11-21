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
class QuantumPhaseDisk extends BABYLON.Mesh {
    constructor(name, scene, blochSphere, verticalPositionInScene) {
        super(name, scene);
        this.blochSphere = blochSphere;

        this.scene = scene;
        this.verticalPositionInScene = verticalPositionInScene;

        this.phaseCyl =
            BABYLON.MeshBuilder.CreateCylinder("phaseCyl",
                {height: 0.01, diameter: 2,
                    faceColors: [
                        new BABYLON.Color4(0.75, 0.75, 0.75, 1),	// bottom cap
                        new BABYLON.Color4(0, 0, 0, 1),				// tube
                        new BABYLON.Color4(0.75, 0.75, 0.75, 1)		// top cap
                    ]},
                scene);
        this.phaseCyl.position.y = verticalPositionInScene;
        this.lineColor = new BABYLON.Color3(.3, .3, .3);
        this.quantumPhaseLine = null;
        this.quantumPhaseLineCap = null;
        this.quantumPhaseLineColor = new BABYLON.Color3(0, 0, 1);

        this.setupDisk();
    }

    getQuantumPhaseCartesianCoords() {
        let xPos = Math.sin(this.blochSphere.getAzimuthRadians());
        let yPos = this.verticalPositionInScene + 0.01;
        let zPos = -Math.cos(this.blochSphere.getAzimuthRadians());

        return new BABYLON.Vector3(xPos, yPos, zPos);
    }

    /// Methods to construct the 3D quantum phase cylinder
    setupDisk() {
        var myMaterial = new BABYLON.StandardMaterial("myMaterial", this.scene);
        this.phaseCyl.material = myMaterial;
        this.position.y = this.verticalPositionInScene;
        this.phaseCyl.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);

        myMaterial.alpha = 1.0;

        // Axis labels
        var zeroChar = this.makeTextPlane("0", "black", 0.2);
        zeroChar.position = new BABYLON.Vector3(0, 0.1, -1.2);
        zeroChar.isPickable = false;

        this.updateQuantumPhaseLine()
    }

    makeTextPlane(text, color, size) {
        var dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", 50, this.scene, true);
        dynamicTexture.hasAlpha = true;
        dynamicTexture.drawText(text, 5, 40, "bold 36px Arial", color, "transparent", true);
        var plane = new BABYLON.Mesh.CreatePlane("TextPlane", size, this.scene, true);
        plane.material = new BABYLON.StandardMaterial("TextPlaneMaterial", this.scene);
        plane.material.backFaceCulling = false;
        plane.material.specularColor = new BABYLON.Color3(0, 0, 0);
        plane.material.diffuseTexture = dynamicTexture;
        return plane;
    }

    updateQuantumPhaseLine() {
        if (this.quantumPhaseLine) this.quantumPhaseLine.dispose();
        if (this.quantumPhaseLineCap) this.quantumPhaseLineCap.dispose();

        let quantumPhaseCartesianCoords = this.getQuantumPhaseCartesianCoords();

        //Array of points to construct Bloch X axis line
        const quantumPhasePoints = [
            this.phaseCyl.position,
            quantumPhaseCartesianCoords
        ];

        this.quantumPhaseLine =
            BABYLON.MeshBuilder.CreateLines("quantumPhasePoints",
                {points: quantumPhasePoints}, this.scene);

        this.quantumPhaseLineCap = BABYLON.MeshBuilder.CreateCylinder("quantumPhaseLineCap", {height: 0.1, diameterTop: 0.0, diameterBottom: 0.1, tessellation: 6, subdivisions: 1 }, this.scene);

        this.quantumPhaseLine.color = this.quantumPhaseLineColor;
        this.quantumPhaseLineCap.color = this.quantumPhaseLineColor;
        this.quantumPhaseLineCap.position = this.getQuantumPhaseCartesianCoords();
        this.quantumPhaseLineCap.rotation = new BABYLON.Vector3(0, -this.blochSphere.getAzimuthRadians(), 0);
    }

}