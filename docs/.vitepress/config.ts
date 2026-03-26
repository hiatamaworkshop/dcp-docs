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

    sidebar: {
      '/dcp/': [
        {
          text: 'Protocol',
          items: [
            { text: 'Specification', link: '/dcp/specification' },
            { text: 'Shadow Index', link: '/dcp/shadow-index' },
            { text: 'Agent Profile', link: '/dcp/agent-profile' },
            { text: 'Validation', link: '/dcp/validation' },
          ]
        }
      ],
      '/research/': [
        {
          text: 'Research',
          items: [
            { text: 'Format Comparison', link: '/research/format-comparison' },
            { text: 'Lightweight LLM', link: '/research/lightweight-llm' },
            { text: 'Density', link: '/research/density' },
          ]
        }
      ]
    },

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