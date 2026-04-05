import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Data Cost Protocol',
  description: 'Compact structured data delivery for AI agents',
  lang: 'en-US',
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#1a1a2e' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Protocol', link: '/dcp/specification' },
      { text: 'Research', link: '/research/format-comparison' },
    ],

    sidebar: [
      {
        text: 'Protocol',
        items: [
          { text: 'Specification', link: '/dcp/specification' },
          { text: 'Schema-Driven Encoder', link: '/dcp/schema-driven-encoder' },
          { text: 'Shadow Index', link: '/dcp/shadow-index' },
          { text: 'Agent Profile', link: '/dcp/agent-profile' },
          { text: 'Pipeline Control', link: '/dcp/pipeline' },
          { text: 'Implementation Helpers', link: '/dcp/implementation' },
        ]
      },
      {
        text: 'Research',
        items: [
          { text: 'Format Comparison', link: '/research/format-comparison' },
          { text: 'Lightweight LLM & Density', link: '/research/lightweight-llm' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hiatamaworkshop/dcp-docs' }
    ],

    footer: {
      message: 'Designed by Hiatama Workshop · <a href="mailto:hiatamaworkshop@gmail.com">hiatamaworkshop@gmail.com</a>',
      copyright: '<a href="https://github.com/hiatamaworkshop/dcp-docs">Source Repository</a>'
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3]
    }
  }
})