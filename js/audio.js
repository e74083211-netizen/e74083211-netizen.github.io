/**
 * ============================================================
 *  AudioController — 背景音乐控制器
 * ============================================================
 *  使用 Web Audio API 生成柔和的背景旋律。
 *  如果 CONFIG.music.src 指定了音频文件，则播放该文件。
 *  否则，生成一段简单的钢琴式旋律。
 *
 *  API:
 *    AudioController.init()    — 初始化（需要用户交互后调用）
 *    AudioController.play()    — 开始播放
 *    AudioController.pause()   — 暂停
 *    AudioController.toggle()  — 切换播放/暂停
 *    AudioController.isPlaying — 当前是否在播放
 * ============================================================
 */

const AudioController = (() => {

  let audioContext = null;
  let audioElement = null;
  let isPlaying = false;
  let initialized = false;
  let gainNode = null;
  let melodyInterval = null;

  /* ── 旋律定义 ── */
  // 使用简单的音符频率来生成一段温柔的旋律
  // C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.00, A4=440.00, B4=493.88
  // C5=523.25, D5=587.33, E5=659.25

  const NOTES = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25,
    F5: 698.46, G5: 783.99,
  };

  // 一段温柔的旋律（音符 + 时长比例）
  const MELODY = [
    { note: 'E4', dur: 1.5 },
    { note: 'G4', dur: 1 },
    { note: 'A4', dur: 1.5 },
    { note: 'G4', dur: 1 },
    { note: 'E4', dur: 1 },
    { note: 'C5', dur: 2 },
    { note: 'B4', dur: 1 },
    { note: 'A4', dur: 1.5 },
    { note: 'G4', dur: 1.5 },
    { note: null, dur: 1 },   // 休止符
    { note: 'A4', dur: 1.5 },
    { note: 'B4', dur: 1 },
    { note: 'C5', dur: 1.5 },
    { note: 'B4', dur: 1 },
    { note: 'A4', dur: 1 },
    { note: 'G4', dur: 2 },
    { note: 'E4', dur: 1.5 },
    { note: 'D4', dur: 1 },
    { note: 'C4', dur: 2 },
    { note: null, dur: 1.5 },
    { note: 'G4', dur: 1 },
    { note: 'A4', dur: 1 },
    { note: 'C5', dur: 1.5 },
    { note: 'E5', dur: 2 },
    { note: 'D5', dur: 1 },
    { note: 'C5', dur: 1.5 },
    { note: 'B4', dur: 1 },
    { note: 'A4', dur: 2 },
    { note: 'G4', dur: 1.5 },
    { note: null, dur: 2 },
  ];

  const TEMPO = 0.35; // 每个时值单位的秒数

  /**
   * 播放一个音符（正弦波 + 包络）
   */
  function playNote(frequency, startTime, duration) {
    if (!audioContext || !gainNode) return;

    const osc = audioContext.createOscillator();
    const noteGain = audioContext.createGain();

    // 使用正弦波，听起来最柔和
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    // 添加轻微的泛音使声音更丰富
    const osc2 = audioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(frequency * 2, startTime);
    const osc2Gain = audioContext.createGain();
    osc2Gain.gain.setValueAtTime(0.08, startTime);

    // 包络：缓入缓出
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.12, startTime + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.06, startTime + duration * 0.4);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(noteGain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(noteGain);
    noteGain.connect(gainNode);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    osc2.start(startTime);
    osc2.stop(startTime + duration + 0.05);
  }

  /**
   * 播放整段旋律
   */
  function playMelody() {
    if (!audioContext || !isPlaying) return;

    let time = audioContext.currentTime + 0.1;

    MELODY.forEach(({ note, dur }) => {
      const duration = dur * TEMPO;
      if (note && NOTES[note]) {
        playNote(NOTES[note], time, duration);
      }
      time += duration;
    });

    // 旋律总时长
    const totalDuration = MELODY.reduce((sum, n) => sum + n.dur * TEMPO, 0);

    // 循环播放
    if (melodyInterval) clearTimeout(melodyInterval);
    melodyInterval = setTimeout(() => {
      if (isPlaying) playMelody();
    }, totalDuration * 1000 + 500);
  }

  /**
   * 初始化音频系统
   */
  function init() {
    if (initialized) return;

    try {
      // 检查是否有自定义音频文件
      if (typeof CONFIG !== 'undefined' && CONFIG.music && CONFIG.music.src) {
        // 使用音频文件
        audioElement = new Audio(CONFIG.music.src);
        audioElement.loop = true;
        audioElement.volume = 0.3;
        initialized = true;
        return;
      }

      // 使用 Web Audio API 生成旋律
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('AudioController: Web Audio API not supported');
        return;
      }

      audioContext = new AudioContextClass();
      gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.connect(audioContext.destination);

      initialized = true;
    } catch (err) {
      console.warn('AudioController: Failed to initialize', err);
    }
  }

  /**
   * 开始播放
   */
  function play() {
    if (!initialized) init();
    if (isPlaying) return;

    try {
      if (audioElement) {
        audioElement.play().catch(() => {});
      } else if (audioContext) {
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        isPlaying = true;
        playMelody();
        return;
      }
      isPlaying = true;
    } catch (err) {
      console.warn('AudioController: Failed to play', err);
    }
  }

  /**
   * 暂停播放
   */
  function pause() {
    isPlaying = false;

    try {
      if (audioElement) {
        audioElement.pause();
      }
      if (melodyInterval) {
        clearTimeout(melodyInterval);
        melodyInterval = null;
      }
    } catch (err) {
      console.warn('AudioController: Failed to pause', err);
    }
  }

  /**
   * 切换播放/暂停
   */
  function toggle() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  /* ── Public API ── */
  return {
    init,
    play,
    pause,
    toggle,
    get isPlaying() { return isPlaying; },
  };

})();
