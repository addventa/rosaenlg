import { RandomManager } from './RandomManager';
import { SaveRollbackManager } from './SaveRollbackManager';

//import * as Debug from 'debug';
//const debug = Debug('freenlg');

export type AsmMode = 'single_sentence' | 'sentences' | 'paragraphs';

export interface Asm {
  mode: AsmMode;
  mix?: boolean;
  separator?: string;
  last_separator?: string;
  if_empty?: string;
  begin_with_1?: string;
  begin_with_general?: string;
  begin_last_1?: string;
  begin_last?: string;
  end?: string;
}

enum positions {
  BEGIN,
  END,
  SEP,
  OTHER,
}

export class AsmManager {
  private saveRollbackManager: SaveRollbackManager;
  private randomManager: RandomManager;
  private spy: Spy;

  public setSpy(spy: Spy): void {
    this.spy = spy;
  }

  public constructor(saveRollbackManager: SaveRollbackManager, randomManager: RandomManager) {
    this.saveRollbackManager = saveRollbackManager;
    this.randomManager = randomManager;
  }

  //-------------- HELPERS, COMMON

  /*
    array of elements to list
    mixin to call for each elt
    asm
    params just pass through
  */
  private foreach(elts: any[], mixinFct: string, asm: Asm, params: any): void {
    if (asm == null || asm.mode == null || ['single_sentence', 'sentences', 'paragraphs'].indexOf(asm.mode) > -1) {
      // ok
    } else {
      let err = new Error();
      err.name = 'InvalidArgumentError';
      err.message = `asm mode is not valid: ${asm.mode}`;
      throw err;
    }

    let targetMixin: string = mixinFct != null ? mixinFct : 'value';
    // debug('aaaa' + targetMixin);

    let nonEmptyElts: any[] = [];

    // 0..length sequence
    let eltsToTest = Array.from(Array(elts.length).keys());

    // we have to mix BEFORE testing
    if (asm != null && asm.mix == true) {
      this.mix(eltsToTest);
    }

    // start
    this.saveRollbackManager.saveSituation('isEmpty');

    for (let i = 0; i < eltsToTest.length; i++) {
      let elt = elts[eltsToTest[i]];
      if (!this.mixinIsEmpty(targetMixin, elt, params)) {
        nonEmptyElts.push(elt);
      }
    }

    this.saveRollbackManager.rollback();

    this.listStuff(targetMixin, nonEmptyElts, asm, params);
  }

  /*
    size: to generate a sequence
  */
  public assemble(which: string, asm: Asm, size: number, params: any): void {
    //console.log('START ASSEMBLE');

    // 0..length sequence
    let eltsToList = Array.from(Array(size).keys());

    this.foreach(eltsToList, which, asm, params);
  }

  private mixinIsEmpty(mixinFct: string, param1: any, params: any): boolean {
    let htmlBefore: string = this.spy.getPugHtml();

    this.spy.getPugMixins()[mixinFct](param1, params);

    // test
    // debug('before: ' + htmlBefore);
    // debug('after: ' + this.spy.getPugHtml());
    let isEmpty: boolean = htmlBefore == this.spy.getPugHtml() ? true : false;

    return isEmpty;
  }

  private listStuff(which: string, nonEmpty: any[], asm: Asm, params: any): void {
    // call one or the other
    if (asm != null && (asm.mode == 'sentences' || asm.mode == 'paragraphs')) {
      this.listStuffSentences(which, nonEmpty, asm, params);
    } else {
      this.listStuffSingleSentence(which, nonEmpty, asm, params);
    }
  }

  private isMixin(name: string): boolean {
    return this.spy.getPugMixins()[name] != null ? true : false;
  }

  private outputStringOrMixinHelper(name: string, params: any): void {
    if (this.isMixin(name)) {
      this.spy.getPugMixins()[name](params);
    } else {
      this.spy.getPugMixins()['insertVal'](name);
    }
  }

  private outputStringOrMixin(name: string, position: positions, params: any): void {
    /*
      should add spaces BEFORE AND AFTER if not present:
        last_separator
        separator
      should add a space AFTER if not present:
        begin_with_general
        begin_with_1
      should add space BEFORE if not present:
        end
    */
    switch (position) {
      case positions.BEGIN:
        this.outputStringOrMixinHelper(name, params);
        this.spy.appendDoubleSpace();
        break;
      case positions.END:
        this.spy.appendDoubleSpace();
        this.outputStringOrMixinHelper(name, params);
        break;
      case positions.SEP:
        this.spy.appendDoubleSpace();
        this.outputStringOrMixinHelper(name, params);
        this.spy.appendDoubleSpace();
        break;
      case positions.OTHER:
        this.outputStringOrMixinHelper(name, params);
        break;
    }
  }

  //-------------- MULTIPLE SENTENCES

  private isDot(str: string): boolean {
    return /^\s*\.\s*$/.test(str);
  }

  private getBeginWith(param: string | string[], index: number): string {
    if (param == null) {
      return null;
    } else if (typeof param === 'string' || param instanceof String) {
      //- if it is a string: we take it, but only once
      //- if it is a mixin: we take it each time
      if (index == 0 || this.isMixin(param as string)) {
        return param as string;
      } else {
        return null;
      }
    } else if (param instanceof Array) {
      if (index < param.length) {
        return param[index];
      } else {
        return null;
      }
    }

    let err = new Error();
    err.name = 'InvalidArgumentError';
    err.message = `invalid begin_with_general: ${JSON.stringify(param)}`;
    throw err;
  }

  private listStuffSentencesHelper(
    beginWith: string,
    params: any,
    elt,
    which: string,
    asm: Asm,
    index: number,
    size: number,
  ): void {
    if (beginWith != null) {
      this.outputStringOrMixin(beginWith, positions.BEGIN, params);
    }
    this.spy.getPugMixins()[which](elt, params);
    this.insertSeparatorSentences(asm, index, size, params);
    //- could set pTriggered to true but no read afterwards
  }

  private insertSeparatorSentences(asm: Asm, index: number, size: number, params: any): void {
    //- at the end, after the last output

    switch (index + 1) {
      case size: {
        if (asm.separator) {
          //- we try to avoid </p>. in the output
          if (!this.isDot(asm.separator)) {
            this.outputStringOrMixin(asm.separator, positions.END, params);
          } else {
            // pug_mixins.flushBuffer(); <= was this really useful?
            if (!this.spy.getPugHtml().endsWith('</p>')) {
              //-| #{'|'+getBufferLastChars(4)+'|'}
              this.outputStringOrMixin(asm.separator, positions.OTHER, params);
            }
          }
        }
        break;
      }
      case size - 1: {
        if (asm.last_separator) {
          this.outputStringOrMixin(asm.last_separator, positions.SEP, params);
        } else if (asm.separator) {
          this.outputStringOrMixin(asm.separator, positions.SEP, params);
        }
        break;
      }
      default: {
        if (asm.separator) {
          this.outputStringOrMixin(asm.separator, positions.SEP, params);
        }
        break;
      }
    }
  }

  private listStuffSentences(which: string, nonEmpty: any[], asm: Asm, params: any): void {
    // debug(nonEmpty);
    let size = nonEmpty.length;

    if (!params) {
      params = {};
    }

    // make it available in params
    params.nonEmpty = nonEmpty;

    if (nonEmpty.length == 0 && asm != null && asm.if_empty != null) {
      this.outputStringOrMixin(asm.if_empty, positions.OTHER, params);
    }

    for (let index = 0; index < nonEmpty.length; index++) {
      //- begin
      let beginWith = null;
      // NB asm cannot be null here as explicitely sentence or paragraph mode
      if (index == 0) {
        if (asm.begin_with_1 != null && nonEmpty.length == 1) {
          beginWith = asm.begin_with_1;
        } else if (asm.begin_with_general != null) {
          beginWith = this.getBeginWith(asm.begin_with_general, 0);
        }
      } else if (index == size - 2) {
        if (asm.begin_last_1 != null) {
          beginWith = asm.begin_last_1;
        } else {
          beginWith = this.getBeginWith(asm.begin_with_general, index);
        }
      } else if (index == size - 1) {
        if (asm.begin_last != null) {
          beginWith = asm.begin_last;
        } else {
          beginWith = this.getBeginWith(asm.begin_with_general, index);
        }
      } else {
        beginWith = this.getBeginWith(asm.begin_with_general, index);
      }

      //- the actual content
      // debug(asm);

      if (asm != null && asm.mode == 'paragraphs') {
        this.spy.getPugMixins().insertValUnescaped('<p>');
        this.listStuffSentencesHelper(beginWith, params, nonEmpty[index], which, asm, index, size);
        this.spy.getPugMixins().insertValUnescaped('</p>');
      } else {
        this.spy.appendDoubleSpace();
        this.listStuffSentencesHelper(beginWith, params, nonEmpty[index], which, asm, index, size);
        this.spy.appendDoubleSpace();
      }

      //-end
      if (index == size - 1) {
        if (asm.end != null && this.isDot(asm.end)) {
          let err = new Error();
          err.name = 'InvalidArgumentError';
          err.message = `when assembles is paragraph, the end is ignored when it is a dot.`;
          throw err;
        }
      }
    }
  }

  //-------------- SINGLE SENTENCE

  private insertSeparatorSingleSentence(asm: Asm, index: number, size: number, params: any): void {
    if (asm) {
      //- last separator
      if (index + 1 == size - 1) {
        if (asm.last_separator) {
          this.outputStringOrMixin(asm.last_separator, positions.SEP, params);
        } else if (asm.separator) {
          this.outputStringOrMixin(asm.separator, positions.SEP, params);
        }
        //- normal one
      } else if (index + 1 < size - 1 && asm.separator) {
        this.outputStringOrMixin(asm.separator, positions.SEP, params);
      }
    }
  }

  private listStuffSingleSentence(which: string, nonEmpty: any[], asm: Asm, params: any): void {
    let size: number = nonEmpty.length;

    if (!params) params = {};
    // make it available in params
    params.nonEmpty = nonEmpty;

    if (nonEmpty.length == 0 && asm != null && asm.if_empty != null) {
      this.outputStringOrMixin(asm.if_empty, positions.OTHER, params);
    }

    for (let index = 0; index < nonEmpty.length; index++) {
      //- begin
      let beginWith: string = null; // strange to have to put null here
      if (index == 0 && asm != null) {
        if (asm.begin_with_1 != null && nonEmpty.length == 1) {
          beginWith = asm.begin_with_1;
        } else if (asm.begin_with_general != null) {
          beginWith = asm.begin_with_general;
        }
      }

      //- the actual content
      if (beginWith != null) {
        this.outputStringOrMixin(beginWith, positions.BEGIN, params);
      }

      this.spy.appendDoubleSpace();
      this.spy.appendDoubleSpace();
      this.spy.getPugMixins()[which](nonEmpty[index], params);
      this.spy.appendDoubleSpace();
      this.insertSeparatorSingleSentence(asm, index, size, params);

      //-end
      if (index == size - 1) {
        if (asm != null && asm.end != null) {
          this.outputStringOrMixin(asm.end, positions.END, params);
        }
      }
    }
  }

  /**
   * Mixes array in place. ES6 version
   * @param {Array} a items An array containing the items.
   * I do not use the shuffle included in random-js because I need to use my own getNextRnd function
   */
  private mix(a: any[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.randomManager.getNextRnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
}
