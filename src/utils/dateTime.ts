import logger from './logger.js';

type DateType = 'base' | 'more' | 'format' | 'formatDate';
type ReturnDateType<MoreType extends DateType> = MoreType extends 'base' ? DateForm : MoreType extends 'format' | 'formatDate' ? string : MoreDateForm;

type DateForm = {
  day: string;
  month: string;
  year: string;
};

type MoreDateForm = {
  hours: string;
  minutes: string;
  seconds: string;
  milliseconds: string;
} & DateForm;

export const getDate = <MoreType extends DateType>({ isMore, actualDate }: { actualDate?: Date | number; isMore: MoreType }): ReturnDateType<MoreType> => {
  const date = actualDate ? new Date(actualDate) : new Date();

  const dateForm: DateForm = {
    year: date.getFullYear().toString(),
    month: (date.getMonth() + 1).toString().padStart(2, '0'),
    day: date.getDate().toString().padStart(2, '0'),
  };

  if (isMore === 'base') return dateForm as ReturnDateType<MoreType>;
  const moreDateForm: MoreDateForm = {
    ...dateForm,
    hours: date.getHours().toString().padStart(2, '0'),
    minutes: date.getMinutes().toString().padStart(2, '0'),
    seconds: date.getSeconds().toString().padStart(2, '0'),
    milliseconds: date.getMilliseconds().toString(),
  };

  if (isMore === 'format') {
    return `${moreDateForm.year}-${moreDateForm.month}-${moreDateForm.day} ${moreDateForm.hours}:${moreDateForm.minutes}:${moreDateForm.seconds}` as ReturnDateType<MoreType>;
  }
  if (isMore === 'formatDate') {
    return `${moreDateForm.year}-${moreDateForm.month}-${moreDateForm.day}` as ReturnDateType<MoreType>;
  }
  return moreDateForm as ReturnDateType<MoreType>;
};

export const timer = async (func: () => Promise<void>, ms = 200): Promise<() => void> =>
  new Promise((resolve, reject) => {
    let isTime = true;
    let isDelay = false;
    let countError = 0;
    const maxCountError = 4;

    resolve(() => (isTime = false));
    while (isTime) {
      const start = Date.now();
      if (!isDelay) {
        func()
          .then()
          .catch((error: unknown) => {
            logger.warn({ err: error }, 'Ошибка таймера');
            if (countError >= maxCountError) {
              isTime = false;
              reject(error);
            }
            countError++;
          });
      }
      const delta = Date.now() - start;
      if (delta < ms) {
        isDelay = true;
        delay(ms - delta).then(() => (isDelay = false));
      }
    }
  });

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const random = (min: number, max: number) => Math.floor(min + Math.random() * (max + 1 - min));
