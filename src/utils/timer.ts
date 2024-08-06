import * as CONFIG from '../config.js';
import { delay } from './dateTime.js';

class Timer {
  private static instance: Timer;

  constructor() {
    if (Timer.instance) return Timer.instance;
    Timer.instance = this;
  }

  CYCLE_TOGGLE = {
    IS_WHILE_DEALS: CONFIG['IS_WHILE_DEALS'],
    IS_WHILE_KEYS: CONFIG['IS_WHILE_KEYS'],
  };

  CYCLE_DELAY = {
    IS_WHILE_DEALS: CONFIG['DELAY_UPDATE_DEALS'],
    IS_WHILE_KEYS: CONFIG['DELAY_UPDATE_KEYS'],
  };

  cycle(hand: keyof typeof this.CYCLE_TOGGLE, func: () => void | Promise<void>) {
    if (this.CYCLE_TOGGLE[hand]) func();
    if (this.CYCLE_TOGGLE[hand]) delay(this.CYCLE_DELAY[hand]).finally(() => this.cycle(hand, func));
    else delay(100).finally(() => this.cycle(hand, func));
  }

  timer(hand: keyof typeof this.CYCLE_TOGGLE, func: () => void | Promise<void>) {
    if (this.CYCLE_TOGGLE[hand]) {
      const time = Date.now();
      if (func)
        Promise.resolve(func()).finally(() => {
          let timeDelay = this.CYCLE_DELAY[hand];
          const nextTime = Date.now();
          if (nextTime - time >= this.CYCLE_DELAY[hand]) timeDelay = 0;
          else timeDelay = nextTime - time;
          delay(timeDelay).finally(() => this.timer(hand, func));
        });
    } else delay(this.CYCLE_DELAY[hand]).finally(() => this.timer(hand, func));
  }
}

export default new Timer();
