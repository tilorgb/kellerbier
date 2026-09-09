// Fixture: a player-facing label written as a literal instead of a
// localisation key resolved through t().
export function build(): { readonly label: string } {
  return { label: 'Start a new run' };
}
