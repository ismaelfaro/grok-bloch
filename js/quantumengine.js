
quantumEngine = {
    QubitState : {
        probAmplitude0 : math.complex(1, 0),
        probAmplitude1 : math.complex(0, 0)
    },
    currentQuantumState : [],
    applyGate: (gate) => { 
        currentQuantumState = math.matrix([
            [this.getProbAmplitude0()],
            [this.getProbAmplitude1()]
        ]);
        console.log("currentQuantumState: " + currentQuantumState);
        var newQuantumState = math.multiply(gate.matrix, currentQuantumState);
        console.log("newQuantumState: " + newQuantumState);

        var probAmp0 = math.subset(newQuantumState, math.index(0, 0));
        var probAmp1 = math.subset(newQuantumState, math.index(1, 0));

        this.setProbAmplitudes(probAmp0, probAmp1);
    },
    nresetGlobalPhase: () => {
        var probAmp0 = math.complex(Math.cos(this.getInclinationRadians() / 2), 0);
        var sinHalfIncl = Math.sin(this.getInclinationRadians() / 2);
        var probAmp1 = math.multiply(
            math.complex(Math.cos(this.getAzimuthRadians()),
                Math.sin(this.getAzimuthRadians())),
            sinHalfIncl);
        this.setProbAmplitudes(probAmp0, probAmp1);
    }
}
