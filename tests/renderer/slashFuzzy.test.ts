import { describe, expect, it } from 'vitest'
import {
  highlightText,
  matchSlashCommand,
  rankSlashCandidates
} from '../../src/renderer/src/utils/slashFuzzy.js'

describe('slashFuzzy matching', () => {
  const cancel = { name: 'cancel', description: '取消当前的执行任务' }
  const review = { name: 'review', description: 'Review 当前的变更' }
  const avatar = { name: 'avatar', description: 'Classify a file icon' }

  it('matches English name substrings case-insensitively and reports ranges', () => {
    const match = matchSlashCommand(review, 'REV')
    expect(match).not.toBeNull()
    expect(match!.nameRanges).toEqual([{ start: 0, end: 3 }])
    expect(match!.descriptionRanges).toEqual([])
  })

  it('prefers name prefix over a later substring within the same name', () => {
    const inner = matchSlashCommand({ name: 'preview', description: '' }, 'rev')!
    const prefix = matchSlashCommand({ name: 'review', description: '' }, 'rev')!
    expect(inner.nameRanges).toEqual([{ start: 1, end: 4 }])
    expect(prefix.score).toBeGreaterThan(inner.score)
  })

  it('matches description text and reports ranges against the description', () => {
    const match = matchSlashCommand(cancel, '取消')!
    expect(match.descriptionRanges).toEqual([{ start: 0, end: 2 }])
    expect(match.nameRanges).toEqual([])
  })

  it('matches full pinyin of a Chinese description (quxiao → 取消)', () => {
    const match = matchSlashCommand(cancel, 'quxiao')!
    expect(match.descriptionRanges).toEqual([{ start: 0, end: 2 }])
  })

  it('matches pinyin initials of a Chinese description (qx → 取消)', () => {
    const match = matchSlashCommand(cancel, 'qx')!
    expect(match.descriptionRanges).toEqual([{ start: 0, end: 2 }])
  })

  it('matches partial pinyin inside the concatenated full-pinyin text', () => {
    const match = matchSlashCommand({ name: 'x', description: '取消当前的执行任务' }, 'dangqian')!
    expect(match.descriptionRanges).toEqual([{ start: 2, end: 4 }])
  })

  it('scores direct text matches above pinyin matches for the same query', () => {
    const direct = matchSlashCommand(cancel, '当前')!
    const viaPinyin = matchSlashCommand(cancel, 'dangqian')!
    expect(direct.score).toBeGreaterThan(viaPinyin.score)
    expect(direct.descriptionRanges).toEqual([{ start: 2, end: 4 }])
  })

  it('returns null for no match and for blank queries', () => {
    expect(matchSlashCommand(avatar, 'zzz')).toBeNull()
    expect(matchSlashCommand(avatar, '   ')).toBeNull()
    expect(matchSlashCommand(avatar, '')).toBeNull()
  })

  it('returns null for pinyin that does not appear in the mapped text', () => {
    // '备份数据'（bei fen shu ju）不含 'beng' 这类连续拼音片段。
    const match = matchSlashCommand({ name: 'backup', description: '备份数据' }, 'beng')
    expect(match).toBeNull()
    expect(matchSlashCommand({ name: 'backup', description: '备份数据' }, 'beifen')!.descriptionRanges)
      .toEqual([{ start: 0, end: 2 }])
  })
})

describe('slashFuzzy ranking', () => {
  const skills = [
    { name: 'preview', description: '' },
    { name: 'review', description: '' },
    { name: 'export', description: '' }
  ]

  it('ranks prefix hits ahead of substring hits', () => {
    const ranked = rankSlashCandidates(skills, 'rev')
    expect(ranked.map((entry) => entry.candidate.name)).toEqual(['review', 'preview'])
  })

  it('keeps the original order for equal scores and filters non-matches', () => {
    const ranked = rankSlashCandidates(skills, 'ex')
    expect(ranked.map((entry) => entry.candidate.name)).toEqual(['export'])
    expect(ranked[0]!.match.nameRanges).toEqual([{ start: 0, end: 2 }])
  })

  it('returns an empty list for a blank query', () => {
    expect(rankSlashCandidates(skills, '')).toEqual([])
    expect(rankSlashCandidates(skills, '   ')).toEqual([])
  })
})

describe('slashFuzzy highlightText', () => {
  it('returns a single plain segment when there are no ranges', () => {
    expect(highlightText('abc', [])).toEqual([{ text: 'abc', highlighted: false }])
  })

  it('splits text around a highlighted range in order', () => {
    expect(highlightText('abcde', [{ start: 2, end: 4 }])).toEqual([
      { text: 'ab', highlighted: false },
      { text: 'cd', highlighted: true },
      { text: 'e', highlighted: false }
    ])
  })

  it('merges overlapping and adjoining ranges and handles ranges at the edges', () => {
    expect(highlightText('取消执行', [{ start: 1, end: 3 }, { start: 2, end: 4 }])).toEqual([
      { text: '取', highlighted: false },
      { text: '消执行', highlighted: true }
    ])
    expect(highlightText('abc', [{ start: 0, end: 2 }, { start: 2, end: 3 }])).toEqual([
      { text: 'abc', highlighted: true }
    ])
  })
})
