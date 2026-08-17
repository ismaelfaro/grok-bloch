# Ⓗ grok-bloch
Application that helps user understand the Bloch Sphere

# 🚀 Use it:

you can run it online: [demo](https://javafxpert.github.io/grok-bloch/) 

or

you can download this repo and run it from a Web server. If you have python, you can start a web server with the next line of code:

  > Python 3 > python -m http.server 8000
  
  > Python 2 > python -m SimpleHTTPServer 8000

open a brownser with the next URL [http://127.0.0.1:8000]

# 🔊 Qubit Noise Lab

The panel in the top left corner turns the Bloch sphere into a small hardware
simulator. Tick **Simulate a real, noisy qubit** and every gate is run twice: once
on a perfect qubit and once on a qubit with the noise of a real device.

* the **black arrow** is the noisy state. Decoherence makes it shorter, because
  the qubit is no longer in a pure state and its Bloch vector ends up inside the
  sphere instead of on the surface
* the **orange ghost arrow** is where the state should have been
* the **score** is the state fidelity between the two, out of 100

## On a phone

The layout adapts to the screen. The gate buttons shrink to two narrow columns,
the sphere is reframed so that it, its labels and the phase disk all fit, and the
Noise Lab becomes a bottom sheet that starts folded away with the score still
showing in its header. Tap the header to open it.

Dragging anywhere on the sphere rotates the camera; a tap without dragging sets
the state to that point.

## What it simulates

| Effect | Where it comes from | What you see |
| --- | --- | --- |
| Energy relaxation (T1) | the qubit leaking its excitation to the environment | the arrow drifts back towards \|0⟩ |
| Dephasing (T2) | the qubit losing track of its phase | the arrow shrinks towards the Z axis, the phase disk fades |
| Gate error | imperfect control pulses, as measured by randomized benchmarking | the arrow shrinks a little on every gate |
| Coherent over-rotation | miscalibrated pulses | the state stays pure but every gate turns too far |
| Readout error | misclassified measurements | the measured counts disagree with the true probabilities |

Because Rz on superconducting hardware is a frame change done in software, the
Z, S, S†, T, T† and Rz buttons cost no time and add no error. X, Y and H cost one
physical pulse, and the arbitrary angle Rx/Ry rotations cost two.

## Making the noise visible

A single qubit gate on current hardware has an error around 0.02%, so a handful
of gates changes nothing you can see. Two controls fix that:

* **Noise amplifier** multiplies every error rate and decoherence rate, up to
  ×10000. This is a teaching aid, not physics.
* **Idle time after each gate** lets the qubit sit and decohere between gates.
  This is physics: waiting is usually the dominant error in a real circuit.

## Running a circuit

Every gate button you press is recorded into a circuit, shown as chips in the
panel. Then:

* **▶ Run / ⏸ Pause** replays the whole circuit through the noise model, one
  gate at a time, with an adjustable speed and an optional loop
* **⏭ Step** runs a single gate
* **⏹ Stop** rewinds to the prepared state
* **🗑 Clear** empties the circuit

Pressing \|0⟩, \|1⟩, clicking a point on the sphere, or pasting a state vector
prepares a new starting state and begins a new circuit.

**1024 shots** samples the qubit the way hardware does, applying the readout
assignment errors on top of the true probabilities.

## Loading a noise model from a real device

The dropdown ships with approximate models for several hardware families
(IBM Heron / Eagle / Falcon / Canary, Rigetti, IonQ, Quantinuum). Those numbers
are rounded values in the range publicly reported for each generation; they show
how the families compare, they do not reproduce one specific chip on one specific
day.

For real data, use **Load calibration JSON…** or **Paste JSON**. Two formats are
accepted.

### Qiskit backend properties

This is how IBM Quantum publishes per qubit calibration data. Export it with:

```python
from qiskit_ibm_runtime import QiskitRuntimeService
import json

service = QiskitRuntimeService()
backend = service.backend("ibm_brisbane")

with open("ibm_brisbane.json", "w") as file:
    json.dump(backend.properties().to_dict(), file, default=str)
```

Every physical qubit in the file becomes a selectable entry, so you can compare
the best and worst qubit on the same chip. T1, T2, the single qubit gate error
and length (preferring `sx`), the readout assignment errors and the readout
length are all read from the file.

### This application's own schema

```json
{
  "name": "My qubit",
  "provider": "My lab",
  "description": "Measured last Tuesday",
  "t1Us": 145.0,
  "t2Us": 96.0,
  "singleQubitErrorRate": 0.00024,
  "singleQubitGateTimeNs": 35,
  "readoutError0as1": 0.008,
  "readoutError1as0": 0.017,
  "excitedStatePopulation": 0.01,
  "virtualZ": true
}
```

Times are in microseconds, gate lengths in nanoseconds, error rates are
probabilities. T2 is clamped to 2·T1, as physics requires.

## The physics, briefly

States are held as Bloch vectors, `rho = (I + r·sigma) / 2`, so that mixed states
have somewhere to live. Gates act as `rho -> U rho U†`.

Thermal relaxation over a duration `t` acts on the Bloch vector as

```
x -> x·exp(-t/T2)
y -> y·exp(-t/T2)
z -> z·exp(-t/T1) + (1 - exp(-t/T1))·(1 - 2·p_excited)
```

Gate error is added as a depolarizing channel `r -> (1-p)·r`. A reported gate
error already includes the decoherence that happens during the pulse, so `p` is
chosen so that the *combined* channel has the reported average error rather than
double counting it. For a channel that maps `r -> A r + c`, the average gate
fidelity is `F = (1 + Tr(A)/3) / 2`, which gives

```
p = 1 - 3·(1 - 2·error) / Tr(A_relaxation)
```

The score is the state fidelity `<psi_ideal| rho |psi_ideal> = (1 + r·s)/2`
against the noiseless run.

# 🍿Credits

Original project from [James Weaver](https://github.com/JavaFXpert)
