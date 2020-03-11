const DRUM_CLASSES = [
'Kick',
'Snare',
'Hi-hat closed',
'Hi-hat open',
'Tom low',
'Tom mid',
'Tom high',
'Clap',
'Rim'
];

const TIME_HUMANIZATION = 0.01;

let sampleBaseUrl = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699';

let reverb = new Tone.Convolver(
`${sampleBaseUrl}/small-drum-room.wav`).
toMaster();
reverb.wet.value = 0.35;

let snarePanner = new Tone.Panner().connect(reverb);
new Tone.LFO(0.13, -0.25, 0.25).connect(snarePanner.pan).start();

let drumKit = [
	new Tone.Players({
	  high: `${sampleBaseUrl}/808-kick-vh.mp3`,
	  med: `${sampleBaseUrl}/808-kick-vm.mp3`,
	  low: `${sampleBaseUrl}/808-kick-vl.mp3` }).
	toMaster(),
	new Tone.Players({
	  high: `${sampleBaseUrl}/flares-snare-vh.mp3`,
	  med: `${sampleBaseUrl}/flares-snare-vm.mp3`,
	  low: `${sampleBaseUrl}/flares-snare-vl.mp3` }).
	connect(snarePanner),
	new Tone.Players({
	  high: `${sampleBaseUrl}/808-hihat-vh.mp3`,
	  med: `${sampleBaseUrl}/808-hihat-vm.mp3`,
	  low: `${sampleBaseUrl}/808-hihat-vl.mp3` }).
	connect(new Tone.Panner(-0.5).connect(reverb)),
	new Tone.Players({
	  high: `${sampleBaseUrl}/808-hihat-open-vh.mp3`,
	  med: `${sampleBaseUrl}/808-hihat-open-vm.mp3`,
	  low: `${sampleBaseUrl}/808-hihat-open-vl.mp3` }).
	connect(new Tone.Panner(-0.5).connect(reverb)),
	new Tone.Players({
	  high: `${sampleBaseUrl}/slamdam-tom-low-vh.mp3`,
	  med: `${sampleBaseUrl}/slamdam-tom-low-vm.mp3`,
	  low: `${sampleBaseUrl}/slamdam-tom-low-vl.mp3` }).
	connect(new Tone.Panner(-0.4).connect(reverb)),
	new Tone.Players({
	  high: `${sampleBaseUrl}/slamdam-tom-mid-vh.mp3`,
	  med: `${sampleBaseUrl}/slamdam-tom-mid-vm.mp3`,
	  low: `${sampleBaseUrl}/slamdam-tom-mid-vl.mp3` }).
	connect(reverb),
	new Tone.Players({
	  high: `${sampleBaseUrl}/slamdam-tom-high-vh.mp3`,
	  med: `${sampleBaseUrl}/slamdam-tom-high-vm.mp3`,
	  low: `${sampleBaseUrl}/slamdam-tom-high-vl.mp3` }).
	connect(new Tone.Panner(0.4).connect(reverb)),
	new Tone.Players({
	  high: `${sampleBaseUrl}/909-clap-vh.mp3`,
	  med: `${sampleBaseUrl}/909-clap-vm.mp3`,
	  low: `${sampleBaseUrl}/909-clap-vl.mp3` }).
	connect(new Tone.Panner(0.5).connect(reverb)),
	new Tone.Players({
	  high: `${sampleBaseUrl}/909-rim-vh.wav`,
	  med: `${sampleBaseUrl}/909-rim-vm.wav`,
	  low: `${sampleBaseUrl}/909-rim-vl.wav` }).
	connect(new Tone.Panner(0.5).connect(reverb))
];

let midiDrums = [36, 38, 42, 46, 41, 43, 45, 49, 51];
let reverseMidiMapping = new Map([
[36, 0],
[35, 0],
[38, 1],
[27, 1],
[28, 1],
[31, 1],
[32, 1],
[33, 1],
[34, 1],
[37, 1],
[39, 1],
[40, 1],
[56, 1],
[65, 1],
[66, 1],
[75, 1],
[85, 1],
[42, 2],
[44, 2],
[54, 2],
[68, 2],
[69, 2],
[70, 2],
[71, 2],
[73, 2],
[78, 2],
[80, 2],
[46, 3],
[67, 3],
[72, 3],
[74, 3],
[79, 3],
[81, 3],
[45, 4],
[29, 4],
[41, 4],
[61, 4],
[64, 4],
[84, 4],
[48, 5],
[47, 5],
[60, 5],
[63, 5],
[77, 5],
[86, 5],
[87, 5],
[50, 6],
[30, 6],
[43, 6],
[62, 6],
[76, 6],
[83, 6],
[49, 7],
[55, 7],
[57, 7],
[58, 7],
[51, 8],
[52, 8],
[53, 8],
[59, 8],
[82, 8]]);


let temperature = 1.2;

let outputs = {
  internal: {
    play: (drumIdx, velocity, time) => {
      drumKit[drumIdx].get(velocity).start(time);
    } 
  } 
};

let rnn = new mm.MusicRNN('static/drum_kit_rnn');

let vae = new mm.MusicVAE('static/drums_2bar_hikl_small');

Promise.all([
	rnn.initialize(),
	vae.initialize(),
	new Promise(res => Tone.Buffer.on('load', res))
]).then(([vars]) => {

 let state = {
    patternLength: 32,
    seedLength: 4,
    swing: 0.55,
    pattern: [[0], [], [2]].concat(_.times(32, i => [])),
    tempo: 120 
  };
	

  let stepEls = [],
  hasBeenStarted = false,
  sequence,
  densityRange = null,
  activeOutput = 'internal';

  function generatePattern(seed, length) {
    let seedSeq = toNoteSequence(seed);
    return rnn.
    continueSequence(seedSeq, length, temperature).
    then(r => seed.concat(fromNoteSequence(r, length)));
  }

  function getStepVelocity(step) {	  
    if (step % 4 === 0) {
      return 'high';
    } else if (step % 2 === 0) {
      return 'med';
    } else {
      return 'low';
    }
  }

  function humanizeTime(time) {
    return time - TIME_HUMANIZATION / 2 + Math.random() * TIME_HUMANIZATION;
  }

  function playPattern() {	  
    sequence = new Tone.Sequence(
    (time, { drums, stepIdx }) => {
      let isSwung = stepIdx % 2 !== 0;
      if (isSwung) {
        time += (state.swing - 0.5) * Tone.Time('8n').toSeconds();
      }
      let velocity = getStepVelocity(stepIdx);
      drums.forEach(d => {
        let humanizedTime = stepIdx === 0 ? time : humanizeTime(time);
        outputs[activeOutput].play(d, velocity, time);
        
      });
    },
    state.pattern.map((drums, stepIdx) => ({ drums, stepIdx })),
    '16n').
    start();
  }

 
 
  function regenerate() {
    let seed = _.take(state.pattern, state.seedLength);
    
    return generatePattern(seed, state.patternLength - seed.length).then(
    result => {
      state.pattern = result;
      onPatternUpdated();
      setDensityValue();
      updateDensityRange();
    });

  }

  function onPatternUpdated() {
	$('#data').val(JSON.stringify(state));
	
    if (sequence) {
      sequence.dispose();
      sequence = null;
      
    }
    
  }

  function toggleStep(cellEl) {
    if (state.pattern && cellEl.classList.contains('cell')) {
      let stepIdx = +cellEl.dataset.stepIdx;
      let cellIdx = +cellEl.dataset.cellIdx;
      let isOn = cellEl.classList.contains('on');
      if (isOn) {
        _.pull(state.pattern[stepIdx], cellIdx);
        cellEl.classList.remove('on');
      } else {
        state.pattern[stepIdx].push(cellIdx);
        cellEl.classList.add('on');
      }
      if (sequence) {
        sequence.at(stepIdx, { stepIdx, drums: state.pattern[stepIdx] });
      }
      setDensityValue();
      densityRange = null;
    }
  }

  function setDensityValue() {
    let totalCellCount = state.pattern.length * 9;
    let activeCellCount = _.sum(state.pattern.map(p => p.length));
    let density = activeCellCount / totalCellCount;
    let roundedDensity = Math.round(density / 0.05) * 0.05;    
    
  }

  function updateDensityRange(
  density =0.05)
  {
	  
    let stepsDown = density / 0.05;
    let stepsUp = (0.75 - density) / 0.05;
    let stepsBeyond = 0.25 / 0.05;

    let emptySeq = toNoteSequence([]);
    let fullSeq = toNoteSequence(
    _.times(state.pattern.length, () => _.range(9)));

    let currentSeq = toNoteSequence(state.pattern);
    
    densityRange = [];
    let interpsUp = stepsDown > 0 ? vae.interpolate([emptySeq, currentSeq], stepsDown) : Promise.resolve([]);
    let interpsDown = stepsUp > 0 ? vae.interpolate(
    [currentSeq, fullSeq],
    stepsUp + stepsBeyond) :
    Promise.resolve([]);

    interpsDown.then(interps => {
      for (let noteSeq of interps) {
        densityRange.push(fromNoteSequence(noteSeq, state.pattern.length));
      }
    }).then(() => densityRange.push(state.pattern)).
    then(() => interpsUp).
    then(interps => {
      for (let noteSeq of interps) {
        if (stepsUp-- > 0) {
          densityRange.push(fromNoteSequence(noteSeq, state.pattern.length));
        }
      }
    });
  }

  function toNoteSequence(pattern) {
    return mm.sequences.quantizeNoteSequence(
    {
      ticksPerQuarter: 220,
      totalTime: pattern.length / 2,
      timeSignatures: [
      {
        time: 0,
        numerator: 4,
        denominator: 4 }],


      tempos: [
      {
        time: 0,
        qpm: 120 }],


      notes: _.flatMap(pattern, (step, index) =>
      step.map(d => ({
        pitch: midiDrums[d],
        startTime: index * 0.5,
        endTime: (index + 1) * 0.5 }))) },



    1);

  }

  
  function fromNoteSequence({ notes }, patternLength) {
    let res = _.times(patternLength, () => []);
    for (let { pitch, quantizedStartStep } of notes) {
      res[quantizedStartStep].push(reverseMidiMapping.get(pitch));
    }
    return res;
  }

 
  function setPatternLength(newPatternLength) {
    if (newPatternLength < state.patternLength) {
      state.pattern.length = newPatternLength;
    } else {
      for (let i = state.pattern.length; i < newPatternLength; i++) {
        state.pattern.push([]);
      }
    }
    let lengthRatio = newPatternLength / state.patternLength;
    state.seedLength = Math.max(
    1,
    Math.min(newPatternLength - 1, Math.round(state.seedLength * lengthRatio)));

    state.patternLength = newPatternLength;
    onPatternUpdated();
    if (Tone.Transport.state === 'started') {
      playPattern();
    }
  }

  function updatePlayPauseIcons() {
    if (Tone.Transport.state === 'started') {
      document.querySelector('.playpause .pause-icon').style.display = null;
      document.querySelector('.playpause .play-icon').style.display = 'none';
    } else {
      document.querySelector('.playpause .play-icon').style.display = null;
      document.querySelector('.playpause .pause-icon').style.display = 'none';
    }
  }

  function encodeState() {
    return Object.keys(state).
    reduce((a, k) => {
      a.push(k + '=' + JSON.stringify(state[k]));
      return a;
    }, []).
    join('&');
  }  

  document.querySelector('.app').addEventListener('click', event => {
    if (event.target.classList.contains('cell')) {
      toggleStep(event.target);
    }
  });
  document.querySelector('.regenerate').addEventListener('click', event => {
    event.preventDefault();
    event.currentTarget.classList.remove('pulse');
    document.querySelector('.playpause').classList.remove('pulse');
    regenerate().then(() => {     
      if (Tone.Transport.state === 'started') {
        setTimeout(() => playPattern(), 0);
      }
    });
  });
  document.querySelector('.playpause').addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('.playpause').classList.remove('pulse');
    if (Tone.Transport.state !== 'started') {
      Tone.context.resume();
      Tone.Transport.start();
      playPattern();
      updatePlayPauseIcons();
      hasBeenStarted = true;
    } else {
      if (sequence) {
        sequence.dispose();
        sequence = null;
      }
      Tone.Transport.pause();
      updatePlayPauseIcons();
    }
  });

  let draggingSeedMarker = false;
  document.querySelector('.app').addEventListener('mousedown', evt => {
    let el = evt.target;
    if (
    el.classList.contains('gutter') &&
    el.classList.contains('seed-marker'))
    {
      draggingSeedMarker = true;
      evt.preventDefault();
    }
  });
  document.querySelector('.app').addEventListener('mouseup', () => {
    draggingSeedMarker = false;
  });
  document.querySelector('.app').addEventListener('mouseover', evt => {
    if (draggingSeedMarker) {
      let el = evt.target;
      while (el) {
        if (el.classList.contains('step')) {
          let stepIdx = +el.dataset.stepIdx;
          if (stepIdx > 0) {
            state.seedLength = stepIdx;
            
          }
          break;
        }
        el = el.parentElement;
      }
    }
  });
  
  

  document.
  querySelector('#tempo').
  addEventListener(
  'input',
  evt => Tone.Transport.bpm.value = state.tempo = +evt.target.value);
   
    
  document.querySelector('.app').style.display = null;
  document.getElementById("regenerate").click();
  
});