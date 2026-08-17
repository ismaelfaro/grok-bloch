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
 * HTML overlay that drives the noise simulator: pick a device, decide how hard
 * to push the noise, replay a circuit, and read the qubit's score.
 */
(function() {

    var simulator = window.quantumSimulator;
    if (!simulator) return;

    var element = function(id) {
        return document.getElementById(id);
    };

    var panel = element('noiseLab');
    var controls = {
        header: element('nlHeader'),
        toggle: element('nlToggle'),
        enabled: element('nlEnabled'),
        model: element('nlModel'),
        modelDescription: element('nlModelDesc'),
        modelSpecs: element('nlModelSpecs'),
        loadFile: element('nlLoadFile'),
        file: element('nlFile'),
        pasteToggle: element('nlPasteToggle'),
        pasteBox: element('nlPasteBox'),
        pasteText: element('nlPasteText'),
        pasteApply: element('nlPasteApply'),
        pasteCancel: element('nlPasteCancel'),
        loadError: element('nlLoadError'),
        qubitPickRow: element('nlQubitPickRow'),
        qubitPick: element('nlQubitPick'),
        scale: element('nlScale'),
        scaleValue: element('nlScaleValue'),
        idle: element('nlIdle'),
        idleValue: element('nlIdleValue'),
        overRotation: element('nlOverRot'),
        overRotationValue: element('nlOverRotValue'),
        program: element('nlProgram'),
        programInfo: element('nlProgramInfo'),
        run: element('nlRun'),
        step: element('nlStep'),
        stop: element('nlStop'),
        clear: element('nlClear'),
        loop: element('nlLoop'),
        speed: element('nlSpeed'),
        scoreValue: element('nlScoreValue'),
        scoreBar: element('nlScoreBar'),
        grade: element('nlGrade'),
        stats: element('nlStats'),
        shots: element('nlShots'),
        shotsOut: element('nlShotsOut'),
        idleNow: element('nlIdleNow'),
        headerScore: element('nlHeaderScore')
    };

    /** Phones and small windows, matching the media query in the stylesheet. */
    function isCompactLayout() {
        return window.matchMedia('(max-width: 760px), (max-height: 560px)').matches;
    }

    var loadedEntries = [];

    /////// Formatting helpers

    /** Times are held in microseconds; show them in whatever unit reads best. */
    function formatTime(microseconds) {
        if (microseconds === 0) return 'none';
        if (microseconds < 0.001) return (microseconds * 1e6).toFixed(1) + ' ps';
        if (microseconds < 1) return (microseconds * 1000).toFixed(microseconds < 0.01 ? 1 : 0) + ' ns';
        if (microseconds < 1000) return microseconds.toFixed(microseconds < 10 ? 2 : 1) + ' µs';
        if (microseconds < 1e6) return (microseconds / 1000).toFixed(2) + ' ms';
        return (microseconds / 1e6).toFixed(2) + ' s';
    }

    function formatPercent(fraction, digits) {
        return (fraction * 100).toFixed(digits === undefined ? 2 : digits) + '%';
    }

    /** Error rates span many orders of magnitude, so switch to scientific notation. */
    function formatErrorRate(rate) {
        if (rate === 0) return '0';
        if (rate < 1e-4) return rate.toExponential(1);
        return formatPercent(rate, rate < 0.01 ? 3 : 2);
    }

    function specRows(target, rows) {
        var html = '';
        for (var i = 0; i < rows.length; i++) {
            html += '<span>' + rows[i][0] + '</span><b>' + rows[i][1] + '</b>';
        }
        target.innerHTML = html;
    }

    /////// Slider mappings (logarithmic, so the useful range is reachable)

    function scaleFromSlider(value) {
        return Math.pow(10, value);
    }

    function idleFromSlider(value) {
        if (value <= 0) return 0;
        return Math.pow(10, value - 2);
    }

    /////// Model selection

    function populateModels() {
        var html = '';
        var currentProvider = null;

        for (var i = 0; i < NoiseModel.PRESETS.length; i++) {
            var preset = NoiseModel.PRESETS[i];
            if (preset.provider !== currentProvider) {
                if (currentProvider !== null) html += '</optgroup>';
                html += '<optgroup label="' + preset.provider + '">';
                currentProvider = preset.provider;
            }
            html += '<option value="' + preset.id + '">' + preset.name + '</option>';
        }
        if (currentProvider !== null) html += '</optgroup>';
        controls.model.innerHTML = html;
    }

    function applySelectedModel() {
        var id = controls.model.value;

        if (id === 'file') {
            var index = parseInt(controls.qubitPick.value, 10) || 0;
            if (loadedEntries[index]) {
                simulator.setNoiseModel(loadedEntries[index].model);
            }
        } else {
            simulator.setNoiseModel(NoiseModel.fromPreset(id));
        }
        controls.qubitPickRow.style.display = (id === 'file' && loadedEntries.length > 1) ? '' : 'none';
        renderModel();
    }

    function renderModel() {
        var model = simulator.model;
        var scale = simulator.noiseScale;

        controls.modelDescription.textContent = model.description +
            (model.source ? ' — ' + model.source + '.' : '');

        // The error a gate really produces once the amplifier and the
        // decoherence during the pulse are taken into account.
        var effectiveError = model.effectiveGateError(Gate.X, scale);

        specRows(controls.modelSpecs, [
            ['T1 (relaxation)', formatTime(model.t1Us)],
            ['T2 (dephasing)', formatTime(model.t2Us)],
            ['1Q gate error', formatErrorRate(model.singleQubitErrorRate)],
            ['1Q gate time', formatTime(model.singleQubitGateTimeNs / 1000)],
            ['Readout error 0→1', formatErrorRate(model.readoutError0as1)],
            ['Readout error 1→0', formatErrorRate(model.readoutError1as0)],
            ['Rz gates', model.virtualZ ? 'virtual (free)' : 'physical pulse'],
            ['Error per X gate now', formatErrorRate(effectiveError)]
        ]);
    }

    function showLoadError(message) {
        controls.loadError.textContent = message;
        controls.loadError.style.display = message ? '' : 'none';
    }

    function applyLoadedEntries(entries) {
        loadedEntries = entries;

        var options = '';
        for (var i = 0; i < entries.length; i++) {
            options += '<option value="' + i + '">' + entries[i].label + '</option>';
        }
        controls.qubitPick.innerHTML = options;
        controls.qubitPick.value = '0';

        var existing = controls.model.querySelector('option[value="file"]');
        if (existing) existing.parentNode.removeChild(existing);

        var group = document.createElement('optgroup');
        group.label = 'Loaded calibration data';
        var option = document.createElement('option');
        option.value = 'file';
        option.textContent = entries[0].model.name.replace(/ - qubit \d+$/, '') +
            ' (' + entries.length + ' qubit' + (entries.length === 1 ? '' : 's') + ')';
        group.appendChild(option);
        controls.model.appendChild(group);

        controls.model.value = 'file';
        showLoadError('');
        applySelectedModel();

        // A freshly loaded real device is only interesting with noise turned on.
        if (!controls.enabled.checked) {
            controls.enabled.checked = true;
            simulator.setEnabled(true);
        }
    }

    function loadJsonText(text) {
        try {
            applyLoadedEntries(NoiseModelLoader.parse(text));
        } catch (error) {
            showLoadError(error.message || String(error));
        }
    }

    /////// Rendering

    function renderProgram() {
        var html = '';
        for (var i = 0; i < simulator.program.length; i++) {
            var className = 'nl-chip';
            if (i < simulator.programCounter - 1) className += ' nl-done';
            else if (i === simulator.programCounter - 1) className += ' nl-current';
            html += '<span class="' + className + '">' + simulator.program[i].name + '</span>';
        }
        if (html === '') {
            html = '<span class="nl-note" style="margin:0">Press gate buttons to build a circuit.</span>';
        }
        controls.program.innerHTML = html;

        controls.programInfo.textContent = simulator.program.length + ' gate' +
            (simulator.program.length === 1 ? '' : 's') +
            (simulator.playing ? ' — running ' + simulator.programCounter + '/' + simulator.program.length : '');

        var hasProgram = simulator.program.length > 0;
        controls.run.disabled = !hasProgram;
        controls.step.disabled = !hasProgram || simulator.playing;
        controls.stop.disabled = !hasProgram;
        controls.run.textContent = simulator.playing ? '⏸ Pause' : '▶ Run';
        controls.run.classList.toggle('nl-primary', !simulator.playing);
    }

    function renderScore() {
        var fidelity = simulator.fidelity();
        var grade = simulator.grade();

        controls.scoreValue.textContent = (fidelity * 100).toFixed(2);
        controls.grade.textContent = grade.letter;
        controls.grade.className = 'nl-grade ' + grade.className;

        // Keeps the score readable while the panel is folded away, which is how
        // it starts out on a phone.
        controls.headerScore.innerHTML = '<span>' + (fidelity * 100).toFixed(1) + '</span>' +
            '<span class="nl-grade nl-mini ' + grade.className + '">' + grade.letter + '</span>';

        // Stretch the bar: the interesting range is the top few percent.
        controls.scoreBar.style.width = Math.max(0, Math.min(1, fidelity)) * 100 + '%';
        controls.scoreBar.style.background = window.getComputedStyle(controls.grade).backgroundColor;

        var state = simulator.state;
        var ideal = simulator.idealState;

        var rows = [
            ['State fidelity', formatPercent(fidelity, 3)],
            ['Purity Tr(ρ²)', state.purity().toFixed(4)],
            ['Bloch vector |r|', state.length().toFixed(4)],
            ['P(|0⟩) ideal', ideal.probability0().toFixed(4)],
            ['P(|0⟩) noisy', state.probability0().toFixed(4)],
            ['Gates run', String(simulator.gatesExecuted)],
            ['Time on hardware', formatTime(simulator.elapsedUs)]
        ];
        if (simulator.lastRunFidelity !== null) {
            rows.push(['Last full run', formatPercent(simulator.lastRunFidelity, 2)]);
        }
        if (simulator.bestRunFidelity !== null) {
            rows.push(['Best full run', formatPercent(simulator.bestRunFidelity, 2)]);
        }
        specRows(controls.stats, rows);

        if (simulator.shots) {
            var shots = simulator.shots;
            specRows(controls.shotsOut, [
                ['Measured |0⟩', shots.zeros + ' (' + formatPercent(shots.zeros / shots.total, 1) + ')'],
                ['Measured |1⟩', shots.ones + ' (' + formatPercent(shots.ones / shots.total, 1) + ')'],
                ['P(1) without readout error', shots.trueProbability1.toFixed(4)],
                ['P(1) with readout error', shots.measuredProbability1.toFixed(4)]
            ]);
        } else {
            controls.shotsOut.innerHTML = '';
        }
    }

    function render() {
        panel.classList.toggle('nl-armed', simulator.enabled && !simulator.model.isNoiseless());
        renderModel();
        renderProgram();
        renderScore();
    }

    /////// Wiring

    populateModels();

    // On a narrow window the panel would sit on top of the sphere or the
    // outcome probability bar, so start out of the way and let the user open
    // it. The score stays visible in the header either way.
    if (window.innerWidth < 1250) {
        panel.classList.add('nl-collapsed');
        controls.toggle.textContent = 'Show';
    }

    controls.header.addEventListener('click', function(event) {
        if (event.target !== controls.toggle) controls.toggle.click();
    });

    controls.toggle.addEventListener('click', function(event) {
        event.stopPropagation();
        var collapsed = panel.classList.toggle('nl-collapsed');
        controls.toggle.textContent = collapsed ? 'Show' : 'Hide';
    });

    controls.enabled.addEventListener('change', function() {
        // Turning noise on while the ideal qubit is selected would do nothing,
        // so move to a real device.
        if (controls.enabled.checked && controls.model.value === 'ideal') {
            controls.model.value = 'ibm_heron';
            applySelectedModel();
        }
        simulator.setEnabled(controls.enabled.checked);
    });

    controls.model.addEventListener('change', applySelectedModel);
    controls.qubitPick.addEventListener('change', applySelectedModel);

    controls.loadFile.addEventListener('click', function() {
        controls.file.click();
    });

    controls.file.addEventListener('change', function() {
        var file = controls.file.files && controls.file.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function() {
            loadJsonText(String(reader.result));
        };
        reader.onerror = function() {
            showLoadError('Could not read the file.');
        };
        reader.readAsText(file);
        controls.file.value = '';
    });

    controls.pasteToggle.addEventListener('click', function() {
        var hidden = controls.pasteBox.style.display === 'none';
        controls.pasteBox.style.display = hidden ? '' : 'none';
        if (hidden) controls.pasteText.focus();
    });

    controls.pasteApply.addEventListener('click', function() {
        loadJsonText(controls.pasteText.value);
        if (!controls.loadError.textContent) {
            controls.pasteBox.style.display = 'none';
            controls.pasteText.value = '';
        }
    });

    controls.pasteCancel.addEventListener('click', function() {
        controls.pasteBox.style.display = 'none';
        showLoadError('');
    });

    controls.scale.addEventListener('input', function() {
        var scale = scaleFromSlider(parseFloat(controls.scale.value));
        simulator.setNoiseScale(scale);
        controls.scaleValue.textContent = '×' + (scale < 10 ? scale.toFixed(1) : Math.round(scale));
        renderModel();
    });

    controls.idle.addEventListener('input', function() {
        var idleTimeUs = idleFromSlider(parseFloat(controls.idle.value));
        simulator.setIdleTimeUs(idleTimeUs);
        controls.idleValue.textContent = formatTime(idleTimeUs);
    });

    controls.overRotation.addEventListener('input', function() {
        var percent = parseFloat(controls.overRotation.value);
        simulator.setCoherentOverRotation(percent / 100);
        controls.overRotationValue.textContent = percent.toFixed(1) + '%';
    });

    controls.run.addEventListener('click', function() {
        if (simulator.playing) {
            simulator.pause();
        } else {
            simulator.play();
        }
    });

    controls.step.addEventListener('click', function() {
        simulator.step();
    });

    controls.stop.addEventListener('click', function() {
        simulator.stop();
    });

    controls.clear.addEventListener('click', function() {
        simulator.clearProgram();
    });

    controls.loop.addEventListener('change', function() {
        simulator.loop = controls.loop.checked;
    });

    controls.speed.addEventListener('input', function() {
        // Drag right for faster playback, so invert the slider value.
        var slider = controls.speed;
        simulator.stepIntervalMs = (parseInt(slider.min, 10) + parseInt(slider.max, 10)) -
            parseInt(slider.value, 10);
    });

    controls.shots.addEventListener('click', function() {
        simulator.runShots(1024);
    });

    controls.idleNow.addEventListener('click', function() {
        simulator.idle(simulator.idleTimeUs > 0 ? simulator.idleTimeUs : simulator.model.t1Us / 10);
    });

    simulator.addChangeListener(render);

    controls.speed.dispatchEvent(new Event('input'));
    applySelectedModel();
    render();
})();
