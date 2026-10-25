// An isolated practice round. It uses the same scoring and tile rules as play,
// but its clock advances only during the explicitly labelled demonstrations.
const STEPS = [
  { id:'tap', segment:0, title:'Tap to create words', detail:'Tap C, then A, then T. Your word grows below.', target:'tile', word:'CAT' },
  { id:'submit', segment:1, title:'Submit when ready', detail:'CAT is ready! Tap the paper plane to score it.', target:'submit' },
  { id:'clear', segment:1, title:'Delete when stuck', detail:'A fresh start helps. Tap the bin to clear this unfinished word.', target:'undo' },
  { id:'timer', segment:2, title:'Watch the timer!', detail:'Quick timer demo: keep making words before this bar runs out.', target:'timer' },
  { id:'longer', segment:3, title:'Longer words boost time!', detail:'Build PLANET, then send it. Six letters refill a low timer.', target:'tile', word:'PLANET' },
  { id:'gold', segment:4, title:'Double your score!', detail:'Build GEM using the glowing gold G, then send it for double points.', target:'tile', word:'GEM' },
  { id:'ice', segment:5, title:'Try an ice tile', detail:'Tap the blue letter. Ice slows the tiles and the clock.', target:'tile', effect:'hourglass' },
  { id:'fire', segment:5, title:'Try a fire tile', detail:'Tap the red letter. Tiles speed up, but the clock keeps its normal pace.', target:'tile', effect:'fire' },
  { id:'gas', segment:5, title:'Try a gas tile', detail:'Tap the magenta letter. Smoke hides letters for a moment. Only one effect runs at a time.', target:'tile', effect:'smoke' },
  { id:'ready', segment:6, title:'Get the highest score!', detail:'You’re ready! Find new words, chase longer ones, and make every letter count.', target:'score' },
];
const PREVIEW_SECONDS = 1.5;
const TIMER_DEMO_SECONDS = 3;
const PRACTICE_WORDS = ['CAT','PLANET','GEM'];
const STREAM_LETTERS = 'AEIOURSTLNCD';

export class TutorialSession {
  constructor(WordGame, config = {}) {
    this.game = new WordGame(PRACTICE_WORDS,config,()=>.5);
    this.game.start(0);
    this.now = 0;
    this.visualTime = 0;
    this.reducedMotion = false;
    this.index = 0;
    this.tiles = [];
    this.layout = {width:360,height:640,top:0,bottom:0};
    this.finished = false;
    this.enterStep();
  }

  get step() { return STEPS[this.index]; }
  get state() {
    const step = this.step;
    const selecting = !this.completed && !this.previewStarted;
    const expected = selecting && step.word ? step.word[this.game.current.length] : '';
    const tile = selecting ? this.tiles.find(candidate => step.effect
      ? candidate.effect === step.effect : candidate.letter === expected) : null;
    const waitingForSubmit = Boolean(step.word && step.id !== 'tap' && this.game.current === step.word);
    const target = this.completed ? (step.id === 'ready' ? 'score' : '')
      : waitingForSubmit ? 'submit' : this.previewStarted ? '' : step.target;
    return {
      id:step.id, title:step.title, detail:this.completionDetail || step.detail,
      target, expectedLetter:tile?.letter || '', targetTileId:tile?.id || '',
      highlightTileIds:tile ? [tile.id] : [], completed:this.completed,
      canContinue:step.id === 'ready', stepIndex:step.segment, stepCount:7,
      substepIndex:this.index, substepCount:STEPS.length,
      previewActive:this.previewStarted && Boolean(this.game.activeEffect),
      visualTime:this.visualTime, nextLabel:step.id === 'ready' ? 'Let’s Play' : '',
      finished:this.finished,
    };
  }

  makeTile(letter,index,count,traits={}) {
    const columns = Math.min(3,count), row = Math.floor(index/columns);
    const rows = Math.ceil(count/columns);
    const rowCount = Math.min(columns,count-row*columns);
    return {
      id:`tutorial-${this.step.id}-${index}`, kind:'letter', letter, blank:false,
      bonus:false, grenade:false, effect:null, ...traits,
      x:0,y:0,baseX:0,baseY:0,yaw:0,pitch:0,tilt:0,pitchOffset:0,yawOffset:0,
      vx:0,vy:0,age:0,spinPhase:0,rotationSpeed:0,
      nx:(index%columns+1)/(rowCount+1), ny:rows === 1 ? .48 : .25+row*.5,
      previewDistance:0,
    };
  }

  enterStep() {
    const step = this.step;
    const previousStream = step.effect ? this.tiles.filter(tile=>tile.tutorialDecorative) : [];
    this.completed = step.id === 'ready';
    this.completionDetail = '';
    this.completionElapsed = 0;
    this.previewStarted = false;
    this.previewElapsed = 0;
    this.demoElapsed = 0;
    this.game.clearEffects();
    if(step.id !== 'submit')this.game.clearCurrentWord();
    if(step.id === 'clear') {
      this.game.select('P',this.now);
      this.game.select('L',this.now);
    }
    if(step.id === 'timer')this.game.remaining = this.game.config.timer.maxSeconds*.65;
    if(step.id === 'longer')this.game.remaining = Math.min(12,this.game.config.timer.maxSeconds*.2);
    if(step.id === 'gold')this.game.remaining = Math.max(this.game.remaining,this.game.config.timer.maxSeconds*.65);
    const word = step.word || '';
    this.tiles = [...word].map((letter,index)=>this.makeTile(letter,index,word.length,
      step.id === 'gold' && index === 0 ? {bonus:true} : {}));
    if(step.effect) {
      this.tiles = previousStream.length ? previousStream : [...STREAM_LETTERS].map((letter,index)=> {
        const tile = this.makeTile(letter,index,STREAM_LETTERS.length,{id:`tutorial-stream-${index}`,tutorialDecorative:true});
        // Four fixed lanes leave the highlighted center tile unobstructed.
        tile.nx = [.125,.305,.695,.875][index%4];
        tile.ny = (Math.floor(index/4)/3+(index%4)*.075)%1;
        return tile;
      });
      this.tiles.push(this.makeTile('C',0,1,{id:`tutorial-${step.id}-special`,effect:step.effect}));
    }
    this.resize(this.layout);
  }

  resize(layout) {
    if(!layout || !Number.isFinite(layout.width) || !Number.isFinite(layout.height))return;
    this.layout = layout;
    const top = (layout.top || 0)+300;
    const bottom = Math.max(top+110,layout.height-(layout.bottom || 0)-156);
    const size = this.game.config.tiles.mobileSize;
    this.motionBand = {top:(layout.top || 0)+58-size,bottom:layout.height-(layout.bottom || 0)-96+size};
    for(const tile of this.tiles) {
      tile.baseX = tile.nx*layout.width;
      tile.baseY = tile.tutorialDecorative
        ? this.motionBand.top+tile.ny*(this.motionBand.bottom-this.motionBand.top)
        : top+tile.ny*(bottom-top);
      tile.x = tile.baseX;
      tile.y = tile.tutorialDecorative ? this.previewY(tile) : tile.baseY;
    }
  }

  previewY(tile) {
    const {top,bottom} = this.motionBand;
    return top+((tile.baseY-top+tile.previewDistance)%(bottom-top));
  }

  complete(detail) {
    if(!this.completed)this.completionElapsed = 0;
    this.completed = true;
    this.completionDetail = detail;
  }

  pick(tile) {
    if(this.finished || this.completed || this.previewStarted || !this.tiles.includes(tile) || tile.tutorialDecorative)return [];
    const step = this.step;
    if(step.effect ? tile.effect !== step.effect : !step.word || tile.letter !== step.word[this.game.current.length])return [];
    const result = this.game.select(tile.letter,this.now,{bonus:tile.bonus,effect:tile.effect});
    if(result.type !== 'letter')return [];
    this.tiles.splice(this.tiles.indexOf(tile),1);
    if(step.effect) {
      this.previewStarted = Boolean(result.tileEffect);
    } else if(step.id === 'tap' && this.game.current === step.word) {
      this.complete('You made CAT! Let’s turn it into points.');
    }
    return [result];
  }

  act(action) {
    if(this.finished)return [];
    if(action === 'tutorial-next') {
      if(this.step.id === 'ready') {
        this.finished = true;
        return [{type:'tutorial-complete'}];
      }
      return [];
    }
    if(this.completed || this.previewStarted)return [];
    const step = this.step;
    if(action === 'undo' && step.id === 'clear') {
      const result = this.game.undo(this.now);
      if(result.type === 'penalty' && result.reason === 'clear') {
        this.complete(`All clear! Deleting costs ${result.penalty} seconds in a real game.`);
        return [result];
      }
    }
    if(action === 'submit' && ['submit','longer','gold'].includes(step.id)) {
      const expected = step.id === 'submit' ? 'CAT' : step.word;
      if(this.game.current !== expected)return [];
      const result = this.game.submit(this.now);
      if(result.type === 'word') {
        const detail = step.id === 'gold' ? `Double Score! GEM earned ${result.points} points.`
          : step.id === 'longer' ? `Nice! PLANET added ${Number(result.reward.toFixed(1))} seconds. Longer words help you keep going.`
          : `Good job! CAT earned ${result.points} points.`;
        this.complete(detail);
        return [result];
      }
    }
    return [];
  }

  advance(dt) {
    if(this.finished || !Number.isFinite(dt) || dt <= 0)return [];
    this.visualTime += dt;
    let dwell = this.completed ? dt : 0;
    if(this.step.effect && !this.reducedMotion) {
      const active = this.previewStarted ? Math.min(dt,this.game.effects[this.step.effect]) : 0;
      const distance = 24*(active*this.game.worldTimeScale+dt-active);
      for(const tile of this.tiles)if(tile.tutorialDecorative) {
        tile.previewDistance += distance;
        tile.y = this.previewY(tile);
      }
    }
    if(this.step.id === 'timer' && !this.completed) {
      const seconds = Math.min(dt,TIMER_DEMO_SECONDS-this.demoElapsed);
      this.demoElapsed += seconds;
      // A labelled fast-forward shows both warnings without making the player
      // wait most of a real round. No word is in progress during this demo.
      const drain = seconds*this.game.config.timer.maxSeconds*.45/TIMER_DEMO_SECONDS;
      this.now += drain*1000;
      this.game.advance(this.now);
      if(this.demoElapsed >= TIMER_DEMO_SECONDS-1e-9) {
        this.complete('The bar changes as time runs low. A longer word can give you a boost!');
        dwell = Math.max(0,dt-seconds);
      }
    } else if(this.previewStarted) {
      const activeSeconds = Math.min(dt,this.game.effects[this.step.effect]);
      // Demonstrate the real effect lifetime without charging time or expiring
      // the selected practice letter while the player reads the instructions.
      const remaining = this.game.remaining, letterSeconds = this.game.letterSeconds;
      // A custom short round must not end inside a visual-only demonstration.
      this.game.remaining = Math.max(remaining,activeSeconds+1);
      this.game.elapse(activeSeconds);
      this.game.remaining = remaining;
      this.game.letterSeconds = letterSeconds;
      this.now += activeSeconds*1000;
      this.game.lastTime = this.now;
      this.previewElapsed += dt;
      if(!this.completed && (this.previewElapsed >= PREVIEW_SECONDS || !this.game.activeEffect)) {
        const detail = this.step.id === 'ice' ? 'Chill! Ice slows the fall and gives you more thinking time.'
          : this.step.id === 'fire' ? 'That’s fire! Faster tiles, with the usual countdown.'
          : 'A little mystery! Smoke fades away. Only one timed effect can run at once.';
        this.complete(detail);
      }
      // The next special appears only after the full current effect and a
      // short release beat, so the player sees each effect start and finish.
      dwell = this.game.activeEffect ? 0 : Math.max(0,dt-activeSeconds);
    }
    if(this.completed && this.step.id !== 'ready') {
      this.completionElapsed += dwell;
      const duration = this.step.id === 'tap' ? .8 : this.step.id === 'gold' ? 1.4 : .9;
      if(this.completionElapsed >= duration-1e-9) {
        this.index++;
        this.enterStep();
        return [{type:'tutorial-step',id:this.step.id}];
      }
    }
    return [];
  }
}
