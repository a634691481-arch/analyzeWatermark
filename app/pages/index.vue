<script setup lang="ts">
import type { ParsedMedia, PlatformInfo } from '#shared/types'
import Marquee from '~/components/inspira/Marquee.vue'
import NumberTicker from '~/components/inspira/NumberTicker.vue'

const toast = useToast()

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
  copyLink,
  reset
} = useMediaParser()

// 进入页面 / 切回标签页 / 首次交互时，自动把剪贴板里的分享文案填进来
const { readFromClipboard } = useClipboardAutofill(inputUrl)

const { data: platforms } = await useFetch<PlatformInfo[]>('/api/platforms', {
  default: () => [] as PlatformInfo[]
})

/** 已适配平台名，用于标题与文案，避免每加一个平台就要手改文案 */
const platformNames = computed(() => platforms.value.map(platform => platform.name))
/** 顿号连接：豆包、抖音、小红书 */
const platformList = computed(() => platformNames.value.join('、'))
/** 斜杠连接：豆包 / 抖音 / 小红书 */
const platformSlash = computed(() => platformNames.value.join(' / '))
const platformKeywords = computed(() => platformNames.value.map(name => `${name}去水印`).join(','))
const platformFeatures = computed(() => platformNames.value.map(name => `${name}无水印下载`))

/** 摘要栏三个操作按钮：移动端要挤在一行里，所以收窄内边距、缩小字号、隐藏图标 */
const compactAction = {
  base: 'justify-center px-2 sm:px-3',
  label: 'text-[11px] sm:text-sm truncate',
  leadingIcon: 'hidden sm:inline-block'
}

/** 放大预览：null 表示关闭，否则是 media 数组下标 */
const previewIndex = ref<number | null>(null)

/** 换一批结果时收起预览，避免下标指向错位 */
watch(result, () => {
  previewIndex.value = null
})

function onPreview(item: ParsedMedia) {
  const position = media.value.findIndex(entry => entry.id === item.id)
  if (position >= 0) previewIndex.value = position
}

async function onCopy(item: ParsedMedia) {
  const ok = await copyLink(item)
  toast.add({
    title: ok ? '链接已复制' : '复制失败',
    description: ok ? '已复制无水印资源地址' : '浏览器拒绝了剪贴板访问，请手动复制',
    color: ok ? 'success' : 'error',
    icon: ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'
  })
}

/**
 * 解析失败统一走 toast，不在页面里留一块常驻红条。
 * errorMessage 每次解析前会被清空，所以同样的错误连续出现也能再次弹出。
 */
watch(errorMessage, (message) => {
  if (!message) return
  toast.add({
    title: message,
    description: '请确认链接完整可访问，且内容中包含图片或视频。',
    color: 'error',
    icon: 'i-lucide-triangle-alert',
    duration: 6000
  })
})

/** 有输入或结果时才需要清空按钮 */
const hasContent = computed(() => Boolean(inputUrl.value.trim() || result.value))

function onClear() {
  reset()
  previewIndex.value = null
  toast.add({
    title: '已清空',
    description: '输入内容与解析结果已重置',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

const steps = [
  {
    no: 'STEP 1',
    title: '复制分享文案',
    text: '在 App 里点分享并复制，整段文案直接粘进来就行，会自动挑出链接。'
  },
  {
    no: 'STEP 2',
    title: '粘贴并解析',
    text: '把链接粘贴到上方输入框，点击「解析」。'
  },
  {
    no: 'STEP 3',
    title: '下载无水印文件',
    text: '单个下载，或勾选多个后打包成一个 zip 下载。'
  }
]

useSeoMeta({
  title: '无水印下载工具 · 一键取回原始文件',
  description: () => `粘贴 ${platformSlash.value} 的分享链接，自动解析出云端保存的无水印原图与原视频，支持单个下载与批量打包，无需安装插件。`,
  ogTitle: '无水印下载工具 · 一键取回原始文件',
  ogDescription: () => `支持${platformList.value}。粘贴分享文案即可取回未压缩的无水印原图与原视频。`,
  ogType: 'website',
  ogSiteName: '去水印',
  ogLocale: 'zh_CN',
  // 相对路径会由 seo-utils 拼成 site.url 下的绝对地址
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
  twitterTitle: '无水印下载工具 · 一键取回原始文件',
  twitterDescription: '粘贴分享文案，取回未压缩的无水印原图与原视频。',
  twitterImage: '/og.png'
})

// keywords 不在 useSeoMeta 的类型里，单独挂
useHead({
  meta: [
    {
      name: 'keywords',
      content: () => `去水印,无水印下载,${platformKeywords.value},图片下载,视频下载`
    }
  ]
})

/** 结构化数据：让搜索引擎知道这是个 Web 工具，而不是一篇内容页 */
useSchemaOrg([
  defineWebSite({
    name: '去水印',
    inLanguage: 'zh-CN'
  }),
  defineSoftwareApp({
    name: '无水印下载工具',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description: `解析${platformList.value}的分享链接，取回无水印原图与原视频。`,
    offers: {
      price: '0',
      priceCurrency: 'CNY'
    },
    featureList: [...platformFeatures.value, '批量打包 zip 下载']
  })
])
</script>

<template>
  <div class="min-h-screen">
    <UContainer class="max-w-6xl py-10 sm:py-16">
      <header class="text-center">
        <UBadge
          color="primary"
          variant="subtle"
          size="sm"
          icon="i-lucide-image-down"
          :label="`已适配 ${platformNames.length} 个平台`"
          class="border border-primary/20"
        />
        <h1
          class="mt-4 bg-gradient-to-b from-white via-white to-emerald-200/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl"
        >
          一键解析无水印原片
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">
          粘贴分享链接，自动提取云端保存的<b class="text-white/90">无水印原图 / 原视频</b>，
          支持单个下载与批量打包，无需安装任何插件。
        </p>

        <!-- 已适配平台：数据来自 /api/platforms，新增平台自动跟着变 -->
        <Marquee
          class="mx-auto mt-7 max-w-3xl [--duration:30s] [--gap:0.75rem] [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
          :repeat="2"
          pause-on-hover
        >
          <span
            v-for="platform in platforms"
            :key="platform.id"
            class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs text-white/70"
            :title="platform.example"
          >
            <UIcon
              v-if="platform.icon"
              :name="platform.icon"
              class="size-4 shrink-0 text-emerald-300/80"
            />
            <span class="font-medium">{{ platform.name }}</span>
          </span>
        </Marquee>
      </header>

      <ParseForm
        v-model="inputUrl"
        :loading="loading"
        :clearable="hasContent"
        @submit="parse"
        @clear="onClear"
        @paste="readFromClipboard"
      />

      <section v-if="result" class="mt-10">
        <div
          class="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UBadge :label="result.platform.name" color="primary" variant="subtle" size="sm" />
              <span class="truncate text-sm font-medium text-highlighted">
                {{ result.title || '未命名作品' }}
              </span>
            </div>
            <p class="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-white/45">
              <span>共</span>
              <NumberTicker :value="media.length" :decimal-places="0" class="font-semibold" />
              <span>个 · 无水印</span>
              <NumberTicker :value="watermarkFreeCount" :decimal-places="0" class="font-semibold" />
              <span>个 · 已选</span>
              <NumberTicker :value="selectedMedia.length" :decimal-places="0" class="font-semibold" />
              <span>个</span>
              <template v-if="result.author">
                <span>· 作者 {{ result.author }}</span>
              </template>
            </p>
          </div>

          <!-- 移动端：三个按钮等分一行；sm 以上恢复自适应排列 -->
          <div class="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :icon="allSelected ? 'i-lucide-square' : 'i-lucide-check-check'"
              :label="allSelected ? '取消全选' : '全选'"
              :ui="compactAction"
              @click="toggleAll"
            />
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-package"
              label="打包下载全部"
              :loading="zipping"
              :disabled="!media.length"
              :ui="compactAction"
              @click="downloadZip(media)"
            />
            <UButton
              size="sm"
              color="primary"
              icon="i-lucide-download"
              :label="`下载选中 (${selectedMedia.length})`"
              :loading="zipping"
              :disabled="!selectedMedia.length"
              :ui="compactAction"
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

      <section v-else-if="!loading" class="mt-14">
        <div class="grid gap-4 sm:grid-cols-3">
          <div
            v-for="step in steps"
            :key="step.no"
            class="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition-colors hover:border-primary/30"
          >
            <span class="text-xs font-semibold tracking-wide text-primary">{{ step.no }}</span>
            <h3 class="mt-2 text-sm font-medium text-highlighted">{{ step.title }}</h3>
            <p class="mt-1 text-xs leading-relaxed text-white/55">{{ step.text }}</p>
          </div>
        </div>

        <p class="mt-8 text-center text-xs leading-relaxed text-white/35">
          原理说明：解析的是平台云端保存的<u>未压缩原始文件</u>，而不是对带水印素材做修补。<br>
          若作者上传时就只有带水印版本，卡片会标注「仅水印版」。
        </p>
      </section>

      <ContactAuthor :url="inputUrl" />

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
