<script setup lang="ts">
import type { ParsedMedia, PlatformInfo } from '#shared/types'

/**
 * 平台落地页（/douyin、/xiaohongshu …）
 *
 * 为什么要有：首页只有一个，长尾词（「抖音去水印」「小红书原图下载」…）
 * 没有落点。每个平台一个独立 URL，各自有独立的 title / description /
 * H1 / 正文 / FAQ，避免薄内容与重复内容两个坑。
 *
 * 平台 id 直接取自适配器注册表，新增平台会自动多出一个落地页。
 */
const route = useRoute()

const { data: platforms } = await useFetch<PlatformInfo[]>('/api/platforms', {
  default: () => [] as PlatformInfo[]
})

const platformId = String(route.params.platform ?? '').toLowerCase()
const platform = platforms.value.find(item => item.id === platformId)

// 不是已知平台就直接 404，避免被当成有效页面收录
if (!platform) {
  throw createError({ statusCode: 404, statusMessage: '没有这个平台', fatal: true })
}

const name = platform.name
const summary = platform.description ?? `粘贴${name}分享链接，取回无水印原图与原视频。`

/** 其它平台：站内互链，利于抓取与权重传递 */
const others = computed(() => platforms.value.filter(item => item.id !== platformId))

// ---------------------------------------------------------------- 解析工具

const {
  inputUrl,
  loading,
  zipping,
  errorMessage,
  result,
  media,
  selectedIds,
  selectedMedia,
  allSelected,
  watermarkFreeCount,
  parse,
  toggle,
  toggleAll,
  downloadOne,
  downloadOriginal,
  downloadZip,
  copyLink
} = useMediaParser()

const previewIndex = ref<number | null>(null)

watch(result, () => {
  previewIndex.value = null
})

function onPreview(item: ParsedMedia) {
  const position = media.value.findIndex(entry => entry.id === item.id)
  if (position >= 0) previewIndex.value = position
}

async function onCopy(item: ParsedMedia) {
  await copyLink(item)
}

// ---------------------------------------------------------------- 文案

const steps = [
  {
    no: '01',
    title: `复制${name}分享链接`,
    text: `在${name}里点分享并复制，整段文案直接粘进来就行，会自动挑出链接。`
  },
  {
    no: '02',
    title: '粘贴并解析',
    text: '服务端读取云端保存的原始文件索引，取出未压缩、无水印的那一份。'
  },
  {
    no: '03',
    title: '下载原片',
    text: '单个保存，或勾选多个打包成 zip 一次带走。'
  }
]

const faqs = [
  {
    question: `${name}去水印是怎么做到的？`,
    answer: `${summary}原理是读取平台云端保存的原始文件地址，而不是对带水印的素材做修补，所以不会二次压缩、也不会降清晰度。`
  },
  {
    question: '需要登录或者安装插件吗？',
    answer: '不需要。粘贴分享链接即可，不需要登录目标平台账号，也不需要安装任何浏览器插件或客户端。'
  },
  {
    question: '可以批量下载吗？',
    answer: '可以。一次解析会列出该链接下的全部素材，勾选后能打包成一个 zip 下载。'
  },
  {
    question: '为什么有的素材标着「仅水印版」？',
    answer: '如果作者上传时本身就只提供了带水印的版本，平台云端没有无水印文件可取，这时会如实标注，不会拿带水印的冒充。'
  },
  {
    question: '下载的素材版权归谁？',
    answer: '版权归原作者所有。本工具只做地址解析与格式转换，请仅用于个人学习与备份，转载或商用请先获得作者授权。'
  }
]

// ---------------------------------------------------------------- SEO

useSeoMeta({
  title: `${name}去水印 · 无水印原图与原片下载`,
  description: `${summary}支持批量打包，无需登录、无需安装插件。`,
  ogTitle: `${name}去水印 · 无水印原图与原片下载`,
  ogDescription: summary,
  ogType: 'article',
  ogSiteName: '去水印',
  ogLocale: 'zh_CN',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
  twitterTitle: `${name}去水印`,
  twitterDescription: summary,
  twitterImage: '/og.png'
})

useHead({
  meta: [
    {
      name: 'keywords',
      content: `${name}去水印,${name}无水印下载,${name}原图下载,${name}视频下载,无水印下载`
    }
  ],
  // FAQPage 结构化数据：有机会拿到搜索结果里的折叠问答
  script: [
    {
      key: 'faq-jsonld',
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer }
        }))
      })
    }
  ]
})

useSchemaOrg([
  defineWebPage({
    name: `${name}去水印`,
    description: summary
  }),
  defineSoftwareApp({
    name: `${name}无水印下载`,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    offers: { price: '0', priceCurrency: 'CNY' }
  })
])
</script>

<template>
  <div class="min-h-screen bg-default">
    <UContainer class="max-w-4xl py-10 sm:py-16">
      <UButton
        to="/"
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        label="返回首页"
        class="mb-6"
      />

      <header>
        <UBadge color="primary" variant="subtle" size="sm" :icon="platform.icon" :label="name" />
        <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
          {{ name }}去水印 · 无水印原图与原片下载
        </h1>
        <p class="mt-4 text-sm leading-relaxed text-muted sm:text-base">
          {{ summary }}
        </p>
      </header>

      <div class="mt-8">
        <ParseForm v-model="inputUrl" :loading="loading" @submit="parse" />
      </div>

      <UAlert
        v-if="errorMessage"
        class="mt-6"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
      />

      <section v-if="result" class="mt-10">
        <div class="flex flex-col gap-4 rounded-2xl bg-elevated p-4 ring ring-default sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ result.title || '未命名作品' }}</p>
            <p class="mt-1 text-xs text-dimmed">
              共 {{ media.length }} 个 · 无水印 {{ watermarkFreeCount }} 个 · 已选 {{ selectedMedia.length }} 个
            </p>
          </div>
          <div class="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :label="allSelected ? '取消全选' : '全选'"
              :ui="{ base: 'justify-center px-2 sm:px-3', label: 'text-[11px] sm:text-sm truncate' }"
              @click="toggleAll"
            />
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              label="打包下载全部"
              :loading="zipping"
              :ui="{ base: 'justify-center px-2 sm:px-3', label: 'text-[11px] sm:text-sm truncate' }"
              @click="downloadZip(media)"
            />
            <UButton
              size="sm"
              color="primary"
              :label="`下载选中 (${selectedMedia.length})`"
              :loading="zipping"
              :disabled="!selectedMedia.length"
              :ui="{ base: 'justify-center px-2 sm:px-3', label: 'text-[11px] sm:text-sm truncate' }"
              @click="downloadZip(selectedMedia)"
            />
          </div>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MediaCard
            v-for="item in media"
            :key="item.id"
            :item="item"
            :selected="selectedIds.includes(item.id)"
            @toggle="toggle"
            @preview="onPreview"
            @download="downloadOne"
            @download-original="downloadOriginal"
            @copy="onCopy"
          />
        </div>
      </section>

      <section v-else class="mt-12">
        <div class="grid gap-4 sm:grid-cols-3">
          <div v-for="step in steps" :key="step.no" class="rounded-2xl bg-elevated p-5 ring ring-default">
            <span class="text-xs font-semibold tracking-wide text-primary">{{ step.no }}</span>
            <h2 class="mt-2 text-sm font-medium text-highlighted">{{ step.title }}</h2>
            <p class="mt-1 text-xs leading-relaxed text-muted">{{ step.text }}</p>
          </div>
        </div>
      </section>

      <section class="mt-14">
        <h2 class="text-lg font-semibold tracking-tight text-highlighted">常见问题</h2>
        <dl class="mt-5 space-y-4">
          <div v-for="faq in faqs" :key="faq.question" class="rounded-2xl bg-elevated p-5 ring ring-default">
            <dt class="text-sm font-medium text-highlighted">{{ faq.question }}</dt>
            <dd class="mt-2 text-xs leading-relaxed text-muted">{{ faq.answer }}</dd>
          </div>
        </dl>
      </section>

      <section class="mt-14">
        <h2 class="text-lg font-semibold tracking-tight text-highlighted">其它已支持的平台</h2>
        <ul class="mt-5 flex flex-wrap gap-2">
          <li v-for="item in others" :key="item.id">
            <UButton
              :to="`/${item.id}`"
              color="neutral"
              variant="soft"
              size="sm"
              :icon="item.icon"
              :label="`${item.name}去水印`"
            />
          </li>
        </ul>
      </section>

      <BackToTop />

      <MediaPreview
        v-model:index="previewIndex"
        :media="media"
        @download="downloadOne"
        @download-original="downloadOriginal"
      />
    </UContainer>
  </div>
</template>
