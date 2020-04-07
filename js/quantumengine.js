
var quantumEngine = () => {
    var QubitState = {
        probAmplitude0 : math.complex(1, 0),
        probAmplitude1 : math.complex(0, 0)
    };
    var currentQuantumState = [];

    getProbAmplitude0:()=>{
        return this.probAmplitude0;
    };
    getProbAmplitude1:()=> {
        return this.probAmplitude1;
    };
    getProbability0:()=> {
        return Math.pow(math.abs(this.getProbAmplitude0()), 2);
    };
    getProbability1:()=> {
        return Math.pow(math.abs(this.getProbAmplitude1()), 2);
    };
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
    };
    resetGlobalPhase: () => {
        var probAmp0 = math.complex(Math.cos(this.getInclinationRadians() / 2), 0);
        var sinHalfIncl = Math.sin(this.getInclinationRadians() / 2);
        var probAmp1 = math.multiply(
            math.complex(Math.cos(this.getAzimuthRadians()),
                Math.sin(this.getAzimuthRadians())),
            sinHalfIncl);
        this.setProbAmplitudes(probAmp0, probAmp1);
    };
    setProbAmplitudes: (probAmp0, probAmp1) => {
        // console.log("In setProbAmplitudes(), probAmp0: " + probAmp0 + ", probAmp1: " + probAmp1);
        this.probAmplitude0 = probAmp0;
        this.probAmplitude1 = probAmp1;

        var inclRads = 2 * math.acos(math.abs(probAmp0));
        // console.log("inclRads: " + inclRads);
        this.setInclinationRadians(inclRads);

        var probAmp0Polar = probAmp0.toPolar();
        var probAmp1Polar = probAmp1.toPolar();
        var azimRads = (probAmp1.toPolar().phi - probAmp0.toPolar().phi);

        // console.log("azimRads: " + azimRads);
        // this.setAzimuthRadians(azimRads);
    }
}
