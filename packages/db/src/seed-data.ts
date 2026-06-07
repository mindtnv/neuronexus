// Realistic seed content for a fullstack .NET + React developer who's also
// learning English and computer-science fundamentals. Consumed by src/seed.ts.
//
// Each seed entry is now a NOTE (note-types M1 model). A note references a
// builtin note-type by `kind`, carries `fields` (field-name → value), and may
// carry note-level `tags`. The seeder runs `generateCards` over the note-type +
// field values to produce one-or-more `cards` rows, then replays each note's
// `ratings` through ts-fsrs onto the generated card(s).
//
// `NoteSeed.ratings` simulates past grades. Empty array → brand-new card
// (state=New). A handful of Goods → mature card with a multi-day interval,
// reps > 3. The executor replays the ratings through ts-fsrs and also inserts
// matching rows into `reviews` so heatmap/retention/forecast look alive.

import { type Rating, type RenderKind } from '@neuronexus/shared';

export type DeckColor = 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'neutral';

export interface NoteSeed {
  /** Which builtin note-type backs this note. Defaults to 'basic'. */
  kind?: Extract<RenderKind, 'basic' | 'cloze' | 'typein'>;
  /**
   * Field values keyed by field name (Basic/Type-in: Front/Back; Cloze:
   * Text/Extra). MARKDOWN source strings — markdown→HTML→sanitize happens at the
   * render edge, not the seed's.
   */
  fields: Record<string, string>;
  tags?: string[];
  /** Replay these ratings to shape FSRS state. Omit → new card. */
  ratings?: Rating[];
}

export interface DeckSeed {
  name: string;
  color: DeckColor;
  children?: DeckSeed[];
  notes?: NoteSeed[];
}

// Build a Basic note from a front/back pair — keeps the bulk of the catalog
// terse while moving it onto the note model. Field values are now MARKDOWN
// SOURCE (rendered markdown→HTML→sanitize at the render edge), so the strings are
// stored verbatim — no HTML escaping. Code-ish tokens with angle brackets (TS/C#
// generics like `<T>`) are written wrapped in markdown inline-code backticks
// (`` `<T>` ``) so they (a) display as literal text via markdown, and (b) survive
// the engine's plaintext extraction — a bare `<T>` would be stripped to the empty
// string and the card skipped.
function basic(
  front: string,
  back: string,
  opts: { tags?: string[]; ratings?: Rating[] } = {},
): NoteSeed {
  return {
    kind: 'basic',
    fields: { Front: front, Back: back },
    tags: opts.tags,
    ratings: opts.ratings,
  };
}

// Rating shorthand — deliberately varied so stats look natural.
const MATURE: Rating[] = [3, 3, 3, 3, 3, 3];
const STUDIED: Rating[] = [3, 3, 3];
const LEARNING: Rating[] = [3];
const ROUGH: Rating[] = [3, 2, 3, 2, 3];
const LAPSED: Rating[] = [3, 3, 3, 1, 3, 3];
const EASY: Rating[] = [4, 4, 3, 4];
const NEW: Rating[] = [];

export const SEED_DECKS: DeckSeed[] = [
  // ─── .NET ─────────────────────────────────────────────────────────────
  {
    name: '.NET',
    color: 'violet',
    children: [
      {
        name: 'C#',
        color: 'violet',
        notes: [
          basic('value vs reference types', 'Value — копируется по значению (struct, enum, primitives). Reference — хранится по ссылке (class, interface, delegate, string).', { tags: ['csharp'], ratings: MATURE }),
          basic('record vs class', 'record — immutable by default, value-based equality, with-expressions. class — reference equality, mutable.', { tags: ['csharp'], ratings: STUDIED }),
          basic('async/await — что делает компилятор', 'Генерирует state machine. await не создаёт поток — он снимает продолжение как callback на TaskAwaiter.', { tags: ['csharp', 'async'], ratings: ROUGH }),
          basic('ConfigureAwait(false)', 'Не возвращать продолжение на исходный SynchronizationContext. В библиотеках — почти всегда false; в UI-коде — true.', { tags: ['csharp', 'async'], ratings: STUDIED }),
          basic('Task vs ValueTask', 'Task — всегда allocates. ValueTask — struct, без allocation если результат готов. Нельзя await-ить дважды.', { tags: ['csharp', 'async'], ratings: LEARNING }),
          basic('IEnumerable vs IQueryable', 'IEnumerable — LINQ-to-Objects, выполняется in-memory. IQueryable — собирает expression tree, EF переводит в SQL.', { tags: ['csharp', 'linq'], ratings: MATURE }),
          basic('LINQ deferred execution', 'Where/Select/... строят итератор, но не выполняют запрос. Триггер — ToList/First/Count/foreach.', { tags: ['csharp', 'linq'], ratings: STUDIED }),
          basic('yield return', 'Ленивый итератор. Компилятор генерирует IEnumerable со стейт-машиной — метод возобновляется на каждом MoveNext().', { tags: ['csharp'], ratings: LEARNING }),
          basic('pattern matching (switch expression)', '`result switch { > 0 => "+", < 0 => "-", _ => "0" }`. Expression-body, exhaustive с discard.', { tags: ['csharp'], ratings: STUDIED }),
          basic('nullable reference types (NRT)', '`#nullable enable` — компилятор отличает string от string?, требует явных проверок перед dereference.', { tags: ['csharp'], ratings: STUDIED }),
          basic('IDisposable / using', 'Release unmanaged resources. `using var x = new Foo();` автоматически Dispose в конце scope. Для async — IAsyncDisposable + `await using`.', { tags: ['csharp'], ratings: MATURE }),
          basic('ref / out / in', 'ref — передача по ссылке (read/write). out — обязан присвоить в методе. in — readonly ref, избегает копии struct.', { tags: ['csharp'], ratings: ROUGH }),
          basic('`Span<T>` / `Memory<T>`', 'Zero-allocation slice над массивом/строкой/stackalloc. Span — stack-only (ref struct), Memory — можно hold на heap.', { tags: ['csharp', 'perf'], ratings: LEARNING }),
          basic('delegate vs event', 'delegate — функциональный тип. event — delegate с ограничением: только += / -= снаружи, invoke только изнутри owner-класса.', { tags: ['csharp'], ratings: STUDIED }),
          basic('extension method', '`public static string Upper(this string s) …`. Добавляет метод к чужому типу без наследования.', { tags: ['csharp'], ratings: STUDIED }),
          basic('readonly struct', 'Все поля readonly, компилятор не делает defensive copy при вызове members. Меньше аллокаций.', { tags: ['csharp', 'perf'], ratings: NEW }),
          basic('init-only setter', '`public string Name { get; init; }` — устанавливается только в ctor или object initializer, потом immutable.', { tags: ['csharp'], ratings: NEW }),
        ],
      },
      {
        name: 'ASP.NET Core',
        color: 'violet',
        notes: [
          basic('middleware pipeline', 'Ordered chain `app.Use(...)` — каждый middleware решает, передать управление `next()` или short-circuit. Порядок имеет значение (Auth перед Authorization).', { tags: ['aspnet'], ratings: MATURE }),
          basic('AddSingleton vs AddScoped vs AddTransient', 'Singleton — один на приложение. Scoped — один на request. Transient — новый при каждом resolve.', { tags: ['aspnet', 'di'], ratings: MATURE }),
          basic('Minimal API vs Controllers', 'Minimal — `app.MapGet(...)`, меньше церемоний, быстрый старт. Controllers — атрибутный роутинг, filters, model binding из коробки, удобнее в больших проектах.', { tags: ['aspnet'], ratings: STUDIED }),
          basic('`IOptions<T>` / `IOptionsMonitor<T>`', 'IOptions — snapshot на старте. IOptionsSnapshot — per-scope, обновляется при перезагрузке конфига. IOptionsMonitor — подписка на изменения в runtime.', { tags: ['aspnet', 'config'], ratings: LEARNING }),
          basic('IHostedService / BackgroundService', 'Long-running background задачи — запускаются с host`ом. BackgroundService — удобный base class с ExecuteAsync.', { tags: ['aspnet'], ratings: STUDIED }),
          basic('Authentication vs Authorization', 'Auth**N** — кто ты (cookie, JWT, OAuth). Auth**Z** — что тебе можно (policy, role, claim).', { tags: ['aspnet', 'security'], ratings: MATURE }),
          basic('Model Binding', 'Маппинг HTTP request → параметры экшена. Источники: route / query / body / header / form. [FromBody] — только один на action.', { tags: ['aspnet'], ratings: STUDIED }),
          basic('action filters', 'Hooks вокруг action: Authorization → Resource → Action → Result → Exception. Реализуй IAsyncActionFilter для cross-cutting (logging, validation).', { tags: ['aspnet'], ratings: LEARNING }),
          basic('CORS', '`builder.Services.AddCors(...)` → `app.UseCors(...)`. Без WithCredentials куки не ходят cross-origin.', { tags: ['aspnet', 'security'], ratings: STUDIED }),
          basic('SignalR', 'Real-time bidirectional поверх WebSocket / SSE / long-polling. Hubs — методы, Clients — рассылка.', { tags: ['aspnet'], ratings: LEARNING }),
          basic('HealthChecks', 'AddHealthChecks → AddCheck — `/health` endpoint. Теги liveness/readiness для Kubernetes.', { tags: ['aspnet', 'ops'], ratings: NEW }),
          basic('ProblemDetails (RFC 7807)', 'Стандартный JSON для ошибок API: type/title/status/detail/instance. `builder.Services.AddProblemDetails()`.', { tags: ['aspnet'], ratings: NEW }),
        ],
      },
      {
        name: 'EF Core',
        color: 'violet',
        notes: [
          basic('DbContext lifecycle', 'Scoped. Не thread-safe. Меняй через AddDbContext, не держи долго — change tracker растёт.', { tags: ['ef'], ratings: MATURE }),
          basic('Code First', 'Модели C# → DbContext.OnModelCreating (Fluent API) или [атрибуты] → migration → SQL.', { tags: ['ef', 'migrations'], ratings: STUDIED }),
          basic('Add-Migration / Update-Database', '`dotnet ef migrations add Init` → SQL в `/Migrations`. `dotnet ef database update` применяет. В CI — `dotnet ef migrations script` + твой раннер.', { tags: ['ef', 'migrations'], ratings: STUDIED }),
          basic('eager vs lazy vs explicit loading', 'Eager — `Include(x => x.Posts)`. Lazy — proxy-классы, загрузка при обращении (N+1 риск). Explicit — `ctx.Entry(e).Collection(...).Load()`.', { tags: ['ef'], ratings: ROUGH }),
          basic('AsNoTracking()', 'Отключает change tracker. Для read-only запросов — ощутимо быстрее и меньше памяти.', { tags: ['ef', 'perf'], ratings: STUDIED }),
          basic('SaveChanges() atomicity', 'Всё в одной транзакции. Если что-то упадёт — всё откатывается. Для multi-SaveChanges явно открывай transaction.', { tags: ['ef'], ratings: STUDIED }),
          basic('Global query filters', '`modelBuilder.Entity<T>().HasQueryFilter(e => !e.IsDeleted)` — авто-добавляет в каждый запрос. Soft delete / multitenancy.', { tags: ['ef'], ratings: LEARNING }),
          basic('FromSqlInterpolated vs FromSqlRaw', 'Interpolated — параметризует безопасно. Raw — голый SQL (SQL injection риск если сплайсить).', { tags: ['ef'], ratings: LEARNING }),
          basic('concurrency token', '[Timestamp] / IsConcurrencyToken — EF добавляет WHERE token=@old в UPDATE. Если 0 строк — DbUpdateConcurrencyException.', { tags: ['ef'], ratings: NEW }),
          basic('split query', '`AsSplitQuery()` — вместо одного JOIN-монстра выполняет несколько отдельных SELECT и собирает в клиенте. Меньше Cartesian explosion.', { tags: ['ef', 'perf'], ratings: NEW }),
        ],
      },
      {
        name: 'Архитектура и паттерны',
        color: 'neutral',
        notes: [
          basic('Dependency Injection (principle)', 'Зависимости передаются через конструктор/параметр, а не создаются внутри. Ослабляет связность, упрощает тесты.', { tags: ['patterns', 'solid'], ratings: MATURE }),
          basic('SOLID · Single Responsibility', 'Один класс = одна причина для изменения. Если описываешь класс словом «и» — пора делить.', { tags: ['solid'], ratings: MATURE }),
          basic('SOLID · Open/Closed', 'Открыт для расширения, закрыт для модификации. Новые фичи через новые типы/реализации, не ломая существующие.', { tags: ['solid'], ratings: STUDIED }),
          basic('SOLID · Liskov Substitution', 'Подтип обязан работать везде, где ожидается базовый. Иначе иерархия врёт (square extends rectangle — классический антипример).', { tags: ['solid'], ratings: LEARNING }),
          basic('SOLID · Interface Segregation', 'Лучше несколько узких интерфейсов, чем один жирный. Клиенты не должны зависеть от методов, которыми не пользуются.', { tags: ['solid'], ratings: STUDIED }),
          basic('SOLID · Dependency Inversion', 'Высокоуровневые модули не зависят от низкоуровневых — оба зависят от абстракций.', { tags: ['solid'], ratings: STUDIED }),
          basic('Repository pattern', 'Абстракция над хранилищем: `IUserRepo.GetById / Add / Remove`. Спорно — EF DbContext уже это и есть, репо сверху часто лишнее.', { tags: ['patterns'], ratings: STUDIED }),
          basic('Unit of Work', 'Группирует операции в атомарную транзакцию. В EF эту роль играет сам DbContext + SaveChanges().', { tags: ['patterns'], ratings: STUDIED }),
          basic('CQRS', 'Command Query Responsibility Segregation. Чтение и запись — разные модели/пути. Часто с MediatR.', { tags: ['patterns'], ratings: LEARNING }),
          basic('Mediator', 'Отправитель → Mediator → обработчик. Убирает прямую связность между компонентами. MediatR в C# — de-facto.', { tags: ['patterns'], ratings: LEARNING }),
          basic('Strategy', 'Семейство алгоритмов за общим интерфейсом. В C# часто = делегат + DI.', { tags: ['patterns'], ratings: STUDIED }),
          basic('Clean Architecture', 'Концентрические слои: Domain ← Application ← Infrastructure / Presentation. Зависимости смотрят внутрь. Инфраструктура — плагин.', { tags: ['architecture'], ratings: LEARNING }),
          basic('DDD · Aggregate root', 'Единица consistency. Снаружи ссылаются только на root; он защищает инварианты всей группы сущностей.', { tags: ['ddd'], ratings: NEW }),
          basic('Domain events', 'Побочный эффект доменной операции (OrderPlaced). Пoтребители внутри или за границей контекста через broker.', { tags: ['ddd'], ratings: NEW }),
        ],
      },
    ],
  },

  // ─── Frontend ──────────────────────────────────────────────────────────
  {
    name: 'Frontend',
    color: 'lime',
    children: [
      {
        name: 'React',
        color: 'lime',
        notes: [
          basic('useState', 'Локальное состояние компонента. Сеттер — immutable, новая ссылка → re-render.', { tags: ['react', 'hooks'], ratings: MATURE }),
          basic('useEffect', 'Побочный эффект после рендера. deps-массив — когда пересчитывать. Cleanup в return.', { tags: ['react', 'hooks'], ratings: MATURE }),
          basic('useMemo vs useCallback', 'Memo — мемоизирует *значение*. Callback — мемоизирует *функцию*. По сути `useMemo(() => fn, deps)`.', { tags: ['react', 'hooks'], ratings: STUDIED }),
          basic('useRef', 'Mutable контейнер, не триггерит re-render. Для DOM-нод, таймеров, предыдущих значений.', { tags: ['react', 'hooks'], ratings: STUDIED }),
          basic('useLayoutEffect', 'Как useEffect, но синхронно после mutations DOM, до paint. Для измерений размеров и антиFlicker.', { tags: ['react', 'hooks'], ratings: LEARNING }),
          basic('keys в списках', 'Стабильный id, НЕ index (если список меняется). React по ним мэтчит старое/новое дерево.', { tags: ['react'], ratings: MATURE }),
          basic('reconciliation', 'Алгоритм сверки старого и нового дерева. Тот же тип узла → обновить props. Другой тип → unmount + mount.', { tags: ['react'], ratings: ROUGH }),
          basic('React Server Components', 'Рендерятся на сервере, не отправляют JS в браузер. Могут импортить server-only код. Не имеют состояния.', { tags: ['react'], ratings: LEARNING }),
          basic('Suspense', 'Граничный компонент — показывает fallback пока дети грузятся. Работает с lazy/data-fetching.', { tags: ['react'], ratings: STUDIED }),
          basic('Context API', 'Пропуск значений вниз без prop-drilling. Consumer перерисовывается при любом изменении context value — не злоупотреблять.', { tags: ['react'], ratings: STUDIED }),
          basic('useTransition', 'Помечает обновление как non-urgent — React может прервать его ради срочных. isPending для индикатора.', { tags: ['react'], ratings: LEARNING }),
          basic('React.memo', 'HOC — компонент не перерисовывается, если props shallow-equal. Не панацея: children/callback/object props ломают мемо.', { tags: ['react', 'perf'], ratings: STUDIED }),
          basic('Controlled vs Uncontrolled inputs', 'Controlled — value в state, onChange обновляет. Uncontrolled — ref + defaultValue. Для форм обычно первое.', { tags: ['react'], ratings: STUDIED }),
          basic('Portals', '`ReactDOM.createPortal(child, container)` — рендер в другую часть DOM при сохранении React-tree. Для модалок/тостов.', { tags: ['react'], ratings: LEARNING }),
          basic('React Query (TanStack)', 'Server-state кэш. `useQuery({ queryKey, queryFn })` — авто retry, stale-while-revalidate, mutations с инвалидацией.', { tags: ['react', 'data'], ratings: STUDIED }),
        ],
      },
      {
        name: 'TypeScript',
        color: 'sky',
        notes: [
          basic('`<T>`', 'Обобщённый параметр типа. `function id<T>(x: T): T { return x }`', { tags: ['ts', 'generic'], ratings: MATURE }),
          basic('`<T extends U>`', 'Ограничение: T должен быть подтипом U.', { tags: ['ts', 'generic'], ratings: STUDIED }),
          basic('keyof T', 'Union всех ключей типа T.', { tags: ['ts'], ratings: MATURE }),
          basic('T[K]', 'Lookup type — тип значения T по ключу K.', { tags: ['ts'], ratings: LEARNING }),
          basic('`Partial<T>`', 'Все поля T становятся опциональными.', { tags: ['ts', 'utility'], ratings: MATURE }),
          basic('`Pick<T, K>` / `Omit<T, K>`', 'Pick оставляет ключи K из T, Omit — убирает.', { tags: ['ts', 'utility'], ratings: STUDIED }),
          basic('`Record<K, V>`', 'Объект с ключами K и значениями V. `Record<string, number>` ≈ `{ [k: string]: number }`.', { tags: ['ts', 'utility'], ratings: MATURE }),
          basic('`ReturnType<F>` / `Parameters<F>`', 'Извлечение типа возврата и параметров функции.', { tags: ['ts', 'utility'], ratings: STUDIED }),
          basic('discriminated union', 'Union с общим литеральным полем-дискриминатором. `{ kind: "ok", value } | { kind: "err", error }`. TypeScript сужает по kind.', { tags: ['ts'], ratings: STUDIED }),
          basic('type guard', 'Функция `x is T` — сужает тип в теле if. Например `function isString(x): x is string { return typeof x === "string" }`.', { tags: ['ts'], ratings: LEARNING }),
          basic('infer U', 'Внутри conditional type захватывает выведенный тип: `type Ret<F> = F extends (...a) => infer R ? R : never`.', { tags: ['ts'], ratings: ROUGH }),
          basic('as const', 'Превращает литералы в readonly + сужает до литеральных типов.', { tags: ['ts'], ratings: STUDIED }),
          basic('satisfies', 'Проверяет соответствие типу, но сохраняет narrow-тип значения. Лучше чем `as` — не затирает выведенные литералы.', { tags: ['ts'], ratings: NEW }),
          basic('`NonNullable<T>`', 'Убирает null и undefined из T.', { tags: ['ts', 'utility'], ratings: LEARNING }),
        ],
      },
      {
        name: 'CSS',
        color: 'sky',
        notes: [
          basic('Flexbox — главные оси', 'main-axis — по flex-direction (row/column). cross-axis — перпендикулярна. justify-content управляет main, align-items — cross.', { tags: ['css'], ratings: STUDIED }),
          basic('flex: 1', 'Shorthand для `flex-grow: 1; flex-shrink: 1; flex-basis: 0`. Элемент заполняет оставшееся место.', { tags: ['css'], ratings: MATURE }),
          basic('Grid — fr unit', 'Fractional unit — доля свободного места. `grid-template-columns: 1fr 2fr` — второй в два раза шире.', { tags: ['css'], ratings: STUDIED }),
          basic('CSS specificity', 'Inline > ID > class/attr > element. Рассчитывается (a,b,c). !important перебивает всё (не злоупотреблять).', { tags: ['css'], ratings: STUDIED }),
          basic('box-sizing: border-box', 'width/height включают padding и border. Без этого расчёты расползаются.', { tags: ['css'], ratings: MATURE }),
          basic('position: sticky', 'Элемент ведёт себя как relative, пока не пересечёт заданный порог — тогда становится fixed. Нужна высота у родителя.', { tags: ['css'], ratings: LEARNING }),
          basic('CSS custom properties (vars)', '`--color: red; color: var(--color)`. Наследуются, можно менять в runtime через style.setProperty.', { tags: ['css'], ratings: STUDIED }),
          basic('z-index gotcha', 'z-index работает только на positioned (не static) элементах. Stacking context изолирует иерархию — высокий z-index внутри не вылезет наружу родителя.', { tags: ['css'], ratings: ROUGH }),
        ],
      },
    ],
  },

  // ─── Computer Science ─────────────────────────────────────────────────
  {
    name: 'Computer Science',
    color: 'sky',
    children: [
      {
        name: 'Алгоритмы',
        color: 'sky',
        notes: [
          basic('Big O notation', 'Верхняя оценка асимптотики — сколько операций в худшем случае при росте входа. Игнорирует константы.', { tags: ['algo'], ratings: MATURE }),
          basic('O(log n)', 'Логарифмическая. На каждом шаге отсекаем половину: binary search, balanced BST, heap.', { tags: ['algo'], ratings: MATURE }),
          basic('O(n log n)', 'Эффективная сортировка сравнением (merge/quick/heap), построение индекса.', { tags: ['algo'], ratings: STUDIED }),
          basic('O(n²)', 'Парные сравнения: bubble sort, вложенные циклы, naive longest-common-subsequence.', { tags: ['algo'], ratings: STUDIED }),
          basic('Binary search', 'На отсортированном массиве — O(log n). Инвариант: искомое всегда в [lo, hi].', { tags: ['algo'], ratings: MATURE }),
          basic('Two pointers', 'Два индекса двигаются по массиву навстречу / в одну сторону. Решает задачи «пара с суммой X», «без повторений», «палиндром».', { tags: ['algo'], ratings: STUDIED }),
          basic('Sliding window', 'Окно фиксированной/переменной ширины сдвигается по массиву. O(n) вместо O(n·k). Пример: max sum of k.', { tags: ['algo'], ratings: STUDIED }),
          basic('DFS', 'Depth-first — идём вглубь, потом назад. Стек (рекурсия). Для графов / дерева / лабиринта.', { tags: ['algo', 'graph'], ratings: STUDIED }),
          basic('BFS', 'Breadth-first — уровень за уровнем, очередь. Даёт кратчайший путь в невзвешенном графе.', { tags: ['algo', 'graph'], ratings: STUDIED }),
          basic('Dijkstra', 'Кратчайшие пути от источника во взвешенном графе с неотрицательными рёбрами. Priority queue, O((V+E) log V).', { tags: ['algo', 'graph'], ratings: LEARNING }),
          basic('Dynamic Programming', 'Оптимальная подструктура + перекрытие подзадач → мемоизация или tabulation. Примеры: LIS, knapsack, edit distance.', { tags: ['algo'], ratings: LEARNING }),
          basic('Greedy', 'Локально-оптимальный выбор на каждом шаге. Работает когда задача имеет matroid-структуру (interval scheduling, Huffman).', { tags: ['algo'], ratings: LEARNING }),
          basic('Quicksort', 'Divide-and-conquer: pivot + partition. Average O(n log n), worst O(n²). In-place, unstable.', { tags: ['algo'], ratings: ROUGH }),
          basic('Mergesort', 'Divide-and-conquer с merge. O(n log n) всегда, O(n) extra space, stable.', { tags: ['algo'], ratings: STUDIED }),
        ],
      },
      {
        name: 'Структуры данных',
        color: 'sky',
        notes: [
          basic('Array', 'Contiguous block. Random access O(1), insert в середину O(n). Memory-friendly (cache).', { tags: ['ds'], ratings: MATURE }),
          basic('Linked list', 'Узлы + указатели. Insert/remove O(1) при известном узле, random access O(n). Плохая cache-локальность.', { tags: ['ds'], ratings: STUDIED }),
          basic('Stack (LIFO)', 'Push/Pop с одного конца — O(1). Применения: undo, call stack, DFS, expression evaluation.', { tags: ['ds'], ratings: MATURE }),
          basic('Queue (FIFO)', 'Enqueue в хвост, Dequeue из головы — O(1). BFS, task scheduling, rate limiting.', { tags: ['ds'], ratings: MATURE }),
          basic('HashMap', 'Hash → bucket. Avg O(1) get/set/remove, worst O(n) при collisions. Нужен хороший hash + resize.', { tags: ['ds'], ratings: STUDIED }),
          basic('HashSet', 'HashMap без значения. O(1) contains/add/remove в среднем.', { tags: ['ds'], ratings: STUDIED }),
          basic('BST (binary search tree)', 'left < node < right. O(log n) когда сбалансировано (AVL / Red-Black), O(n) в вырожденном случае.', { tags: ['ds'], ratings: LEARNING }),
          basic('Heap / Priority Queue', 'Complete binary tree с heap-invariant. Вставка / удаление корня O(log n). Для top-k, Dijkstra.', { tags: ['ds'], ratings: LEARNING }),
          basic('Trie (prefix tree)', 'Дерево символов слова. Поиск префикса O(len), autocomplete, IP routing.', { tags: ['ds'], ratings: NEW }),
          basic('Bloom filter', 'Probabilistic set. False positives да, false negatives нет. Крошечное место, O(k) операций.', { tags: ['ds'], ratings: NEW }),
        ],
      },
      {
        name: 'Базы данных',
        color: 'sky',
        notes: [
          basic('B-tree index', 'Основной индекс РСУБД. Сбалансированное дерево, поиск O(log n). Хорош для range scan (BETWEEN, ORDER BY).', { tags: ['db'], ratings: STUDIED }),
          basic('Hash index', 'Точный поиск по ключу O(1). Не помогает для range / ORDER BY. В Postgres поддерживается, но B-tree почти всегда лучше.', { tags: ['db'], ratings: LEARNING }),
          basic('Covering index', 'Индекс содержит все поля нужного запроса — СУБД не идёт в heap. INCLUDE в Postgres / included columns в SQL Server.', { tags: ['db', 'perf'], ratings: LEARNING }),
          basic('Нормализация (1NF, 2NF, 3NF)', '1NF — атомарные значения. 2NF — зависимость от всего ключа. 3NF — никаких транзитивных зависимостей через не-ключ.', { tags: ['db'], ratings: STUDIED }),
          basic('Когда денормализовать', 'Когда чтения доминируют и JOIN-ы — горлышко. Или при доменной агрегации (event-store read-model).', { tags: ['db'], ratings: LEARNING }),
          basic('ACID', 'Atomicity, Consistency, Isolation, Durability. Классические гарантии РСУБД-транзакции.', { tags: ['db'], ratings: MATURE }),
          basic('Isolation levels', 'Read Uncommitted → Read Committed → Repeatable Read → Serializable. Выше уровень — меньше аномалий, больше блокировок.', { tags: ['db'], ratings: ROUGH }),
          basic('JOIN типы', 'INNER — пересечение. LEFT — все из левой + совпадения справа. FULL — всё. CROSS — декартово.', { tags: ['db', 'sql'], ratings: MATURE }),
          basic('Window functions', 'SUM/RANK/ROW_NUMBER OVER (PARTITION BY ... ORDER BY ...). Агрегация без сворачивания строк. Running totals, top-N per group.', { tags: ['db', 'sql'], ratings: LEARNING }),
          basic('EXPLAIN / query plan', 'Показывает как СУБД собирается выполнять запрос. Seq Scan vs Index Scan, стоимость, rows estimate. Медленный запрос → EXPLAIN ANALYZE.', { tags: ['db', 'perf'], ratings: STUDIED }),
          basic('N+1 query problem', 'Итерация по коллекции → отдельный запрос на каждый элемент. Решается через eager loading (Include) / JOIN / батчами.', { tags: ['db', 'ef'], ratings: STUDIED }),
          basic('Deadlock', 'Две транзакции держат ресурсы и ждут друг друга. СУБД детектит и kill одну. Решения: единый порядок захвата, меньшие транзакции, retry.', { tags: ['db'], ratings: LEARNING }),
        ],
      },
      {
        name: 'System Design',
        color: 'neutral',
        notes: [
          basic('Load balancer', 'Распределяет трафик между инстансами. Round-robin / least-connections / IP hash. L4 (TCP) vs L7 (HTTP).', { tags: ['sysdesign'], ratings: STUDIED }),
          basic('Cache (Redis / Memcached)', 'In-memory KV. TTL, LRU eviction. Паттерны: cache-aside, write-through, write-behind. Инвалидация — самая сложная проблема.', { tags: ['sysdesign'], ratings: STUDIED }),
          basic('Message queue', 'Async communication через брокер (RabbitMQ, Kafka, SQS). Decoupling, back-pressure, retry. At-least-once vs exactly-once доставка.', { tags: ['sysdesign'], ratings: LEARNING }),
          basic('CDN', 'Content Delivery Network — статика ближе к пользователю. Edge caching, SSL termination, DDoS shield.', { tags: ['sysdesign'], ratings: STUDIED }),
          basic('Microservices vs Monolith', 'Моно — проще до ~5 команд. Микро — independent deploy, другой стек на команду, но network call = новый failure mode.', { tags: ['sysdesign'], ratings: ROUGH }),
          basic('REST vs gRPC vs GraphQL', 'REST — universal, human-debuggable. gRPC — бинарный, HTTP/2, strict contract (proto). GraphQL — клиент описывает форму ответа.', { tags: ['sysdesign'], ratings: LEARNING }),
          basic('CAP-теорема', 'Consistency / Availability / Partition tolerance — выбери 2. Распределённые системы всегда жертвуют C или A при partition.', { tags: ['sysdesign'], ratings: STUDIED }),
          basic('Circuit breaker', 'Wrapper вокруг ненадёжного downstream. Open после N fail → быстро возвращает ошибку вместо hang. Half-open для probe.', { tags: ['sysdesign'], ratings: LEARNING }),
          basic('Rate limiting', 'Token bucket / leaky bucket / sliding window. Защита от abuse и от самих себя (не положить downstream).', { tags: ['sysdesign'], ratings: STUDIED }),
          basic('Idempotency key', 'Клиент шлёт UUID в заголовке. Сервер хранит результат ответа — повтор того же ключа возвращает старый ответ. Safe retry.', { tags: ['sysdesign'], ratings: NEW }),
        ],
      },
    ],
  },

  // ─── English ──────────────────────────────────────────────────────────
  {
    name: 'English',
    color: 'amber',
    children: [
      {
        name: 'IT vocabulary',
        color: 'amber',
        notes: [
          basic('deployment', 'деплой, развёртывание — «we\'re rolling out a deployment tonight»', { tags: ['it'], ratings: MATURE }),
          basic('rollback', 'откат изменений — «let\'s roll back to the previous release»', { tags: ['it'], ratings: STUDIED }),
          basic('code review', 'код-ревью — «can you give this a quick code review?»', { tags: ['it'], ratings: MATURE }),
          basic('pull request (PR)', 'пул-реквест — «I opened a PR for the auth refactor»', { tags: ['it'], ratings: MATURE }),
          basic('merge conflict', 'конфликт слияния — «I\'ve got a nasty merge conflict in the store.ts»', { tags: ['it'], ratings: STUDIED }),
          basic('technical debt', 'технический долг — «we\'re piling up tech debt in the reporting module»', { tags: ['it'], ratings: STUDIED }),
          basic('refactor', 'рефакторить — «I\'d like to refactor this before we add features»', { tags: ['it'], ratings: MATURE }),
          basic('scalable', 'масштабируемый — «this design won\'t scale beyond 10k users»', { tags: ['it'], ratings: STUDIED }),
          basic('throughput', 'пропускная способность (операций в секунду) — «our write throughput dropped by 40%»', { tags: ['it'], ratings: LEARNING }),
          basic('latency', 'задержка (time per request) — «p95 latency is up to 800ms»', { tags: ['it'], ratings: LEARNING }),
          basic('downtime', 'время простоя — «we\'re aiming for zero downtime deployments»', { tags: ['it'], ratings: STUDIED }),
          basic('regression', 'регрессия (сломалось то, что работало) — «this change introduced a regression in checkout»', { tags: ['it'], ratings: LEARNING }),
          basic('race condition', 'состояние гонки — «we\'re hitting a race condition between cache and DB writes»', { tags: ['it'], ratings: ROUGH }),
          basic('edge case', 'крайний случай — «did you cover the empty-array edge case?»', { tags: ['it'], ratings: STUDIED }),
          basic('bandwidth (metaphor)', 'время / ресурс — «I don\'t have the bandwidth for that this sprint»', { tags: ['it', 'idiom'], ratings: LEARNING }),
        ],
      },
      {
        name: 'Meeting phrases',
        color: 'amber',
        notes: [
          basic('Let me follow up on that', 'Уточню и вернусь с ответом — когда не знаешь ответ сразу.', { tags: ['meeting'], ratings: STUDIED }),
          basic('Could you elaborate?', 'Можете раскрыть мысль? — вежливый способ попросить подробностей.', { tags: ['meeting'], ratings: STUDIED }),
          basic("That's a fair point", 'Справедливое замечание — признаёшь валидность возражения.', { tags: ['meeting'], ratings: LEARNING }),
          basic("I'd push back on that", 'Я бы возразил — мягкое «не согласен», без конфликта.', { tags: ['meeting'], ratings: LEARNING }),
          basic("Let's circle back", 'Вернёмся к этому позже — отложить обсуждение.', { tags: ['meeting', 'idiom'], ratings: STUDIED }),
          basic("Let's take this offline", 'Обсудим это отдельно — когда тема не релевантна общему митингу.', { tags: ['meeting', 'idiom'], ratings: LEARNING }),
          basic("I'm on the fence about it", 'Я ещё не определился — нейтральная позиция.', { tags: ['meeting', 'idiom'], ratings: NEW }),
          basic('Could you walk me through it?', 'Пройдитесь по шагам, пожалуйста — когда нужно подробное объяснение.', { tags: ['meeting'], ratings: STUDIED }),
          basic("Let's align on the goals", 'Давайте сверим цели — prep-фраза для стратегических обсуждений.', { tags: ['meeting'], ratings: ROUGH }),
          basic("That's out of scope", 'Это вне рамок задачи — вежливый отказ расширять объём.', { tags: ['meeting'], ratings: LEARNING }),
        ],
      },
      {
        name: 'Everyday business',
        color: 'amber',
        notes: [
          basic("I'm swamped", 'Я завален работой — «sorry, I\'m swamped today, can we reschedule?»', { tags: ['idiom'], ratings: STUDIED }),
          basic('On the same page', 'Мы понимаем друг друга одинаково — «just making sure we\'re on the same page»', { tags: ['idiom'], ratings: MATURE }),
          basic('Touch base', 'Связаться, сверить статус — «let\'s touch base on Friday»', { tags: ['idiom'], ratings: STUDIED }),
          basic('Out of the loop', 'Не в курсе — «I\'ve been out of the loop on this project»', { tags: ['idiom'], ratings: LEARNING }),
          basic('Ballpark estimate', 'Приблизительная оценка — «can you give me a ballpark estimate?»', { tags: ['idiom'], ratings: LEARNING }),
          basic('Low-hanging fruit', 'Лёгкие быстрые победы — «let\'s knock out the low-hanging fruit first»', { tags: ['idiom'], ratings: STUDIED }),
          basic('Move the needle', 'Дать заметный эффект — «this change actually moves the needle»', { tags: ['idiom'], ratings: NEW }),
          basic('Back to the drawing board', 'Начинаем сначала — когда план провалился.', { tags: ['idiom'], ratings: NEW }),
          basic("I'll loop you in", 'Я добавлю тебя в переписку — «I\'ll loop you in on the next email»', { tags: ['idiom'], ratings: LEARNING }),
          basic('Bite the bullet', 'Стиснуть зубы и сделать неприятное — «we\'ll just have to bite the bullet and rewrite it»', { tags: ['idiom'], ratings: NEW }),
        ],
      },
      // Exercises the Cloze + Type-in builtins (not just Basic) so the seed
      // covers all three note-types end-to-end.
      {
        name: 'Practice',
        color: 'amber',
        notes: [
          {
            kind: 'cloze',
            fields: {
              // Markdown source: the cloze markup (`{{c1::…}}`) and surrounding text
              // are stored verbatim; the render edge runs markdown→HTML→sanitize.
              Text: 'The HTTP status code for "Not Found" is {{c1::404}}, and "Internal Server Error" is {{c2::500}}.',
              Extra: 'Both are common to see in API logs.',
            },
            tags: ['http', 'cloze'],
            ratings: STUDIED,
          },
          {
            kind: 'cloze',
            fields: {
              Text: 'In Big-O, binary search is {{c1::O(log n)}} and a naive nested loop is {{c2::O(n²)}}.',
              Extra: '',
            },
            tags: ['algo', 'cloze'],
            ratings: LEARNING,
          },
          {
            kind: 'typein',
            fields: {
              Front: 'Type the HTTP verb used to fully replace a resource.',
              Back: 'PUT',
            },
            tags: ['http', 'typein'],
            ratings: NEW,
          },
          {
            kind: 'typein',
            fields: {
              Front: 'Type the SQL keyword that removes duplicate rows from a result set.',
              Back: 'DISTINCT',
            },
            tags: ['sql', 'typein'],
            ratings: EASY,
          },
        ],
      },
    ],
  },
];
