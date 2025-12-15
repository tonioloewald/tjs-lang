export const compareSemanticVersion = (a: string, b: string): number => {
  const aSemantic = a.split('.').map((s: string) => Number(s))
  const bSemantic = b.split('.').map((s: string) => Number(s))
  for (const i in aSemantic) {
    if (aSemantic[i] > bSemantic[i]) {
      return -1
    } else if (bSemantic[i] > aSemantic[i]) {
      return 1
    }
  }
  return 0
}
