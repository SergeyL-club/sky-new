import type { ElementHandle, Page, Browser } from 'puppeteer';

export type Keys = {
  [key: string]: string;
};

export type Params = {
  headless: boolean;
  args: string[];
  defaultViewport: {
    width: number;
    height: number;
  };
  ignoreDefaultArgs: string[];
  userDataDir: string;
};

export type ProxyData = {
  url: string;
  user: string;
  pass: string;
};

export type InputSet = {
  input: ElementHandle;
  text: string;
  page?: Page;
};
