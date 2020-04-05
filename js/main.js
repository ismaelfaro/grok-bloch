
var canvas = document.getElementById('renderCanvas');

var config = {
    devicePixelRatio: window.devicePixelRatio || 1.0,
    fontSize: 28 * devicePixelRatio
};

// load the 3D engine
var engine = new BABYLON.Engine(canvas, true);

engine.setHardwareScalingLevel(1.0 / config.devicePixelRatio);

// call the createScene function
var scene = createScene(engine, canvas, config);

// run the render loop
engine.runRenderLoop(function() {
    scene.base.render();
    bloch = scene.blochSphere;
    console.log(">>>>>",bloch.anim)

    // if(bloch.anim){
    //     bloch.tmpInc = (bloch.getInclinationRadians() - bloch.tmpInc)/2
    //     bloch.tmpAzi = (bloch.getAzimuthRadians()-bloch.tmpAzi)/2
    //     console.log(">>>>>",bloch.tmpInc,">>>>",bloch.tmpAzi)
    //     console.log("<<<<<",bloch.getInclinationRadians(),"<<<<",bloch.getAzimuthRadians());
    //     if (bloch.tmpInc < 0.1 && bloch.tmpAzi < 0.1){
    //         bloch.anim = false;
    //         bloch.tmpInc = bloch.getInclinationRadians();
    //         bloch.tmpAzi = bloch.getAzimuthRadians();
    //     }
    // } else{
    //     bloch.tmpInc = bloch.getInclinationRadians();
    //     bloch.tmpAzi = bloch.getAzimuthRadians();
    // }


});

// the canvas/window resize event handler
window.addEventListener('resize', function() {
    engine.resize();
});

