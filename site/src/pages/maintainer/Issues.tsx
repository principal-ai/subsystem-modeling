import { IssueFixHero } from '../../components/IssueFixHero'
import { SectionPager } from './shared'

export function MaintainerIssues() {
  return (
    <section className="maintainer-page issues-page">
      <IssueFixHero />
      <SectionPager sectionId="issues" />
    </section>
  )
}
