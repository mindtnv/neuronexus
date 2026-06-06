// Realistic seed content for a fullstack .NET + React developer who's also
// learning English and computer-science fundamentals. Consumed by src/seed.ts.
//
// Each `CardSeed.ratings` simulates past grades. Empty array → brand-new card
// (state=New). A handful of Goods → mature card with a multi-day interval,
// reps > 3. The executor replays the ratings through ts-fsrs and also inserts
// matching rows into `reviews` so heatmap/retention/forecast look alive.

import type { Rating } from '@neuronexus/shared';

export type DeckColor = 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'neutral';

export interface CardSeed {
  front: string;
  back: string;
  tags?: string[];
  /** Replay these ratings to shape FSRS state. Omit → new card. */
  ratings?: Rating[];
}

export interface DeckSeed {
  name: string;
  color: DeckColor;
  children?: DeckSeed[];
  cards?: CardSeed[];
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
        cards: [
          { front: 'value vs reference types', back: 'Value — копируется по значению (struct, enum, primitives). Reference — хранится по ссылке (class, interface, delegate, string).', tags: ['csharp'], ratings: MATURE },
          { front: 'record vs class', back: 'record — immutable by default, value-based equality, with-expressions. class — reference equality, mutable.', tags: ['csharp'], ratings: STUDIED },
          { front: 'async/await — что делает компилятор', back: 'Генерирует state machine. await не создаёт поток — он снимает продолжение как callback на TaskAwaiter.', tags: ['csharp', 'async'], ratings: ROUGH },
          { front: 'ConfigureAwait(false)', back: 'Не возвращать продолжение на исходный SynchronizationContext. В библиотеках — почти всегда false; в UI-коде — true.', tags: ['csharp', 'async'], ratings: STUDIED },
          { front: 'Task vs ValueTask', back: 'Task — всегда allocates. ValueTask — struct, без allocation если результат готов. Нельзя await-ить дважды.', tags: ['csharp', 'async'], ratings: LEARNING },
          { front: 'IEnumerable vs IQueryable', back: 'IEnumerable — LINQ-to-Objects, выполняется in-memory. IQueryable — собирает expression tree, EF переводит в SQL.', tags: ['csharp', 'linq'], ratings: MATURE },
          { front: 'LINQ deferred execution', back: 'Where/Select/... строят итератор, но не выполняют запрос. Триггер — ToList/First/Count/foreach.', tags: ['csharp', 'linq'], ratings: STUDIED },
          { front: 'yield return', back: 'Ленивый итератор. Компилятор генерирует IEnumerable со стейт-машиной — метод возобновляется на каждом MoveNext().', tags: ['csharp'], ratings: LEARNING },
          { front: 'pattern matching (switch expression)', back: '`result switch { > 0 => "+", < 0 => "-", _ => "0" }`. Expression-body, exhaustive с discard.', tags: ['csharp'], ratings: STUDIED },
          { front: 'nullable reference types (NRT)', back: '`#nullable enable` — компилятор отличает string от string?, требует явных проверок перед dereference.', tags: ['csharp'], ratings: STUDIED },
          { front: 'IDisposable / using', back: 'Release unmanaged resources. `using var x = new Foo();` автоматически Dispose в конце scope. Для async — IAsyncDisposable + `await using`.', tags: ['csharp'], ratings: MATURE },
          { front: 'ref / out / in', back: 'ref — передача по ссылке (read/write). out — обязан присвоить в методе. in — readonly ref, избегает копии struct.', tags: ['csharp'], ratings: ROUGH },
          { front: 'Span<T> / Memory<T>', back: 'Zero-allocation slice над массивом/строкой/stackalloc. Span — stack-only (ref struct), Memory — можно hold на heap.', tags: ['csharp', 'perf'], ratings: LEARNING },
          { front: 'delegate vs event', back: 'delegate — функциональный тип. event — delegate с ограничением: только += / -= снаружи, invoke только изнутри owner-класса.', tags: ['csharp'], ratings: STUDIED },
          { front: 'extension method', back: '`public static string Upper(this string s) …`. Добавляет метод к чужому типу без наследования.', tags: ['csharp'], ratings: STUDIED },
          { front: 'readonly struct', back: 'Все поля readonly, компилятор не делает defensive copy при вызове members. Меньше аллокаций.', tags: ['csharp', 'perf'], ratings: NEW },
          { front: 'init-only setter', back: '`public string Name { get; init; }` — устанавливается только в ctor или object initializer, потом immutable.', tags: ['csharp'], ratings: NEW },
        ],
      },
      {
        name: 'ASP.NET Core',
        color: 'violet',
        cards: [
          { front: 'middleware pipeline', back: 'Ordered chain `app.Use(...)` — каждый middleware решает, передать управление `next()` или short-circuit. Порядок имеет значение (Auth перед Authorization).', tags: ['aspnet'], ratings: MATURE },
          { front: 'AddSingleton vs AddScoped vs AddTransient', back: 'Singleton — один на приложение. Scoped — один на request. Transient — новый при каждом resolve.', tags: ['aspnet', 'di'], ratings: MATURE },
          { front: 'Minimal API vs Controllers', back: 'Minimal — `app.MapGet(...)`, меньше церемоний, быстрый старт. Controllers — атрибутный роутинг, filters, model binding из коробки, удобнее в больших проектах.', tags: ['aspnet'], ratings: STUDIED },
          { front: 'IOptions<T> / IOptionsMonitor<T>', back: 'IOptions — snapshot на старте. IOptionsSnapshot — per-scope, обновляется при перезагрузке конфига. IOptionsMonitor — подписка на изменения в runtime.', tags: ['aspnet', 'config'], ratings: LEARNING },
          { front: 'IHostedService / BackgroundService', back: 'Long-running background задачи — запускаются с host`ом. BackgroundService — удобный base class с ExecuteAsync.', tags: ['aspnet'], ratings: STUDIED },
          { front: 'Authentication vs Authorization', back: 'Auth**N** — кто ты (cookie, JWT, OAuth). Auth**Z** — что тебе можно (policy, role, claim).', tags: ['aspnet', 'security'], ratings: MATURE },
          { front: 'Model Binding', back: 'Маппинг HTTP request → параметры экшена. Источники: route / query / body / header / form. [FromBody] — только один на action.', tags: ['aspnet'], ratings: STUDIED },
          { front: 'action filters', back: 'Hooks вокруг action: Authorization → Resource → Action → Result → Exception. Реализуй IAsyncActionFilter для cross-cutting (logging, validation).', tags: ['aspnet'], ratings: LEARNING },
          { front: 'CORS', back: '`builder.Services.AddCors(...)` → `app.UseCors(...)`. Без WithCredentials куки не ходят cross-origin.', tags: ['aspnet', 'security'], ratings: STUDIED },
          { front: 'SignalR', back: 'Real-time bidirectional поверх WebSocket / SSE / long-polling. Hubs — методы, Clients — рассылка.', tags: ['aspnet'], ratings: LEARNING },
          { front: 'HealthChecks', back: 'AddHealthChecks → AddCheck — `/health` endpoint. Теги liveness/readiness для Kubernetes.', tags: ['aspnet', 'ops'], ratings: NEW },
          { front: 'ProblemDetails (RFC 7807)', back: 'Стандартный JSON для ошибок API: type/title/status/detail/instance. `builder.Services.AddProblemDetails()`.', tags: ['aspnet'], ratings: NEW },
        ],
      },
      {
        name: 'EF Core',
        color: 'violet',
        cards: [
          { front: 'DbContext lifecycle', back: 'Scoped. Не thread-safe. Меняй через AddDbContext, не держи долго — change tracker растёт.', tags: ['ef'], ratings: MATURE },
          { front: 'Code First', back: 'Модели C# → DbContext.OnModelCreating (Fluent API) или [атрибуты] → migration → SQL.', tags: ['ef', 'migrations'], ratings: STUDIED },
          { front: 'Add-Migration / Update-Database', back: '`dotnet ef migrations add Init` → SQL в `/Migrations`. `dotnet ef database update` применяет. В CI — `dotnet ef migrations script` + твой раннер.', tags: ['ef', 'migrations'], ratings: STUDIED },
          { front: 'eager vs lazy vs explicit loading', back: 'Eager — `Include(x => x.Posts)`. Lazy — proxy-классы, загрузка при обращении (N+1 риск). Explicit — `ctx.Entry(e).Collection(...).Load()`.', tags: ['ef'], ratings: ROUGH },
          { front: 'AsNoTracking()', back: 'Отключает change tracker. Для read-only запросов — ощутимо быстрее и меньше памяти.', tags: ['ef', 'perf'], ratings: STUDIED },
          { front: 'SaveChanges() atomicity', back: 'Всё в одной транзакции. Если что-то упадёт — всё откатывается. Для multi-SaveChanges явно открывай transaction.', tags: ['ef'], ratings: STUDIED },
          { front: 'Global query filters', back: '`modelBuilder.Entity<T>().HasQueryFilter(e => !e.IsDeleted)` — авто-добавляет в каждый запрос. Soft delete / multitenancy.', tags: ['ef'], ratings: LEARNING },
          { front: 'FromSqlInterpolated vs FromSqlRaw', back: 'Interpolated — параметризует безопасно. Raw — голый SQL (SQL injection риск если сплайсить).', tags: ['ef'], ratings: LEARNING },
          { front: 'concurrency token', back: '[Timestamp] / IsConcurrencyToken — EF добавляет WHERE token=@old в UPDATE. Если 0 строк — DbUpdateConcurrencyException.', tags: ['ef'], ratings: NEW },
          { front: 'split query', back: '`AsSplitQuery()` — вместо одного JOIN-монстра выполняет несколько отдельных SELECT и собирает в клиенте. Меньше Cartesian explosion.', tags: ['ef', 'perf'], ratings: NEW },
        ],
      },
      {
        name: 'Архитектура и паттерны',
        color: 'neutral',
        cards: [
          { front: 'Dependency Injection (principle)', back: 'Зависимости передаются через конструктор/параметр, а не создаются внутри. Ослабляет связность, упрощает тесты.', tags: ['patterns', 'solid'], ratings: MATURE },
          { front: 'SOLID · Single Responsibility', back: 'Один класс = одна причина для изменения. Если описываешь класс словом «и» — пора делить.', tags: ['solid'], ratings: MATURE },
          { front: 'SOLID · Open/Closed', back: 'Открыт для расширения, закрыт для модификации. Новые фичи через новые типы/реализации, не ломая существующие.', tags: ['solid'], ratings: STUDIED },
          { front: 'SOLID · Liskov Substitution', back: 'Подтип обязан работать везде, где ожидается базовый. Иначе иерархия врёт (square extends rectangle — классический антипример).', tags: ['solid'], ratings: LEARNING },
          { front: 'SOLID · Interface Segregation', back: 'Лучше несколько узких интерфейсов, чем один жирный. Клиенты не должны зависеть от методов, которыми не пользуются.', tags: ['solid'], ratings: STUDIED },
          { front: 'SOLID · Dependency Inversion', back: 'Высокоуровневые модули не зависят от низкоуровневых — оба зависят от абстракций.', tags: ['solid'], ratings: STUDIED },
          { front: 'Repository pattern', back: 'Абстракция над хранилищем: `IUserRepo.GetById / Add / Remove`. Спорно — EF DbContext уже это и есть, репо сверху часто лишнее.', tags: ['patterns'], ratings: STUDIED },
          { front: 'Unit of Work', back: 'Группирует операции в атомарную транзакцию. В EF эту роль играет сам DbContext + SaveChanges().', tags: ['patterns'], ratings: STUDIED },
          { front: 'CQRS', back: 'Command Query Responsibility Segregation. Чтение и запись — разные модели/пути. Часто с MediatR.', tags: ['patterns'], ratings: LEARNING },
          { front: 'Mediator', back: 'Отправитель → Mediator → обработчик. Убирает прямую связность между компонентами. MediatR в C# — de-facto.', tags: ['patterns'], ratings: LEARNING },
          { front: 'Strategy', back: 'Семейство алгоритмов за общим интерфейсом. В C# часто = делегат + DI.', tags: ['patterns'], ratings: STUDIED },
          { front: 'Clean Architecture', back: 'Концентрические слои: Domain ← Application ← Infrastructure / Presentation. Зависимости смотрят внутрь. Инфраструктура — плагин.', tags: ['architecture'], ratings: LEARNING },
          { front: 'DDD · Aggregate root', back: 'Единица consistency. Снаружи ссылаются только на root; он защищает инварианты всей группы сущностей.', tags: ['ddd'], ratings: NEW },
          { front: 'Domain events', back: 'Побочный эффект доменной операции (OrderPlaced). Пoтребители внутри или за границей контекста через broker.', tags: ['ddd'], ratings: NEW },
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
        cards: [
          { front: 'useState', back: 'Локальное состояние компонента. Сеттер — immutable, новая ссылка → re-render.', tags: ['react', 'hooks'], ratings: MATURE },
          { front: 'useEffect', back: 'Побочный эффект после рендера. deps-массив — когда пересчитывать. Cleanup в return.', tags: ['react', 'hooks'], ratings: MATURE },
          { front: 'useMemo vs useCallback', back: 'Memo — мемоизирует *значение*. Callback — мемоизирует *функцию*. По сути `useMemo(() => fn, deps)`.', tags: ['react', 'hooks'], ratings: STUDIED },
          { front: 'useRef', back: 'Mutable контейнер, не триггерит re-render. Для DOM-нод, таймеров, предыдущих значений.', tags: ['react', 'hooks'], ratings: STUDIED },
          { front: 'useLayoutEffect', back: 'Как useEffect, но синхронно после mutations DOM, до paint. Для измерений размеров и антиFlicker.', tags: ['react', 'hooks'], ratings: LEARNING },
          { front: 'keys в списках', back: 'Стабильный id, НЕ index (если список меняется). React по ним мэтчит старое/новое дерево.', tags: ['react'], ratings: MATURE },
          { front: 'reconciliation', back: 'Алгоритм сверки старого и нового дерева. Тот же тип узла → обновить props. Другой тип → unmount + mount.', tags: ['react'], ratings: ROUGH },
          { front: 'React Server Components', back: 'Рендерятся на сервере, не отправляют JS в браузер. Могут импортить server-only код. Не имеют состояния.', tags: ['react'], ratings: LEARNING },
          { front: 'Suspense', back: 'Граничный компонент — показывает fallback пока дети грузятся. Работает с lazy/data-fetching.', tags: ['react'], ratings: STUDIED },
          { front: 'Context API', back: 'Пропуск значений вниз без prop-drilling. Consumer перерисовывается при любом изменении context value — не злоупотреблять.', tags: ['react'], ratings: STUDIED },
          { front: 'useTransition', back: 'Помечает обновление как non-urgent — React может прервать его ради срочных. isPending для индикатора.', tags: ['react'], ratings: LEARNING },
          { front: 'React.memo', back: 'HOC — компонент не перерисовывается, если props shallow-equal. Не панацея: children/callback/object props ломают мемо.', tags: ['react', 'perf'], ratings: STUDIED },
          { front: 'Controlled vs Uncontrolled inputs', back: 'Controlled — value в state, onChange обновляет. Uncontrolled — ref + defaultValue. Для форм обычно первое.', tags: ['react'], ratings: STUDIED },
          { front: 'Portals', back: '`ReactDOM.createPortal(child, container)` — рендер в другую часть DOM при сохранении React-tree. Для модалок/тостов.', tags: ['react'], ratings: LEARNING },
          { front: 'React Query (TanStack)', back: 'Server-state кэш. `useQuery({ queryKey, queryFn })` — авто retry, stale-while-revalidate, mutations с инвалидацией.', tags: ['react', 'data'], ratings: STUDIED },
        ],
      },
      {
        name: 'TypeScript',
        color: 'sky',
        cards: [
          { front: '<T>', back: 'Обобщённый параметр типа. `function id<T>(x: T): T { return x }`', tags: ['ts', 'generic'], ratings: MATURE },
          { front: '<T extends U>', back: 'Ограничение: T должен быть подтипом U.', tags: ['ts', 'generic'], ratings: STUDIED },
          { front: 'keyof T', back: 'Union всех ключей типа T.', tags: ['ts'], ratings: MATURE },
          { front: 'T[K]', back: 'Lookup type — тип значения T по ключу K.', tags: ['ts'], ratings: LEARNING },
          { front: 'Partial<T>', back: 'Все поля T становятся опциональными.', tags: ['ts', 'utility'], ratings: MATURE },
          { front: 'Pick<T, K> / Omit<T, K>', back: 'Pick оставляет ключи K из T, Omit — убирает.', tags: ['ts', 'utility'], ratings: STUDIED },
          { front: 'Record<K, V>', back: 'Объект с ключами K и значениями V. Record<string, number> ≈ { [k: string]: number }.', tags: ['ts', 'utility'], ratings: MATURE },
          { front: 'ReturnType<F> / Parameters<F>', back: 'Извлечение типа возврата и параметров функции.', tags: ['ts', 'utility'], ratings: STUDIED },
          { front: 'discriminated union', back: 'Union с общим литеральным полем-дискриминатором. `{ kind: "ok", value } | { kind: "err", error }`. TypeScript сужает по kind.', tags: ['ts'], ratings: STUDIED },
          { front: 'type guard', back: 'Функция `x is T` — сужает тип в теле if. Например `function isString(x): x is string { return typeof x === "string" }`.', tags: ['ts'], ratings: LEARNING },
          { front: 'infer U', back: 'Внутри conditional type захватывает выведенный тип: `type Ret<F> = F extends (...a) => infer R ? R : never`.', tags: ['ts'], ratings: ROUGH },
          { front: 'as const', back: 'Превращает литералы в readonly + сужает до литеральных типов.', tags: ['ts'], ratings: STUDIED },
          { front: 'satisfies', back: 'Проверяет соответствие типу, но сохраняет narrow-тип значения. Лучше чем `as` — не затирает выведенные литералы.', tags: ['ts'], ratings: NEW },
          { front: 'NonNullable<T>', back: 'Убирает null и undefined из T.', tags: ['ts', 'utility'], ratings: LEARNING },
        ],
      },
      {
        name: 'CSS',
        color: 'sky',
        cards: [
          { front: 'Flexbox — главные оси', back: 'main-axis — по flex-direction (row/column). cross-axis — перпендикулярна. justify-content управляет main, align-items — cross.', tags: ['css'], ratings: STUDIED },
          { front: 'flex: 1', back: 'Shorthand для `flex-grow: 1; flex-shrink: 1; flex-basis: 0`. Элемент заполняет оставшееся место.', tags: ['css'], ratings: MATURE },
          { front: 'Grid — fr unit', back: 'Fractional unit — доля свободного места. `grid-template-columns: 1fr 2fr` — второй в два раза шире.', tags: ['css'], ratings: STUDIED },
          { front: 'CSS specificity', back: 'Inline > ID > class/attr > element. Рассчитывается (a,b,c). !important перебивает всё (не злоупотреблять).', tags: ['css'], ratings: STUDIED },
          { front: 'box-sizing: border-box', back: 'width/height включают padding и border. Без этого расчёты расползаются.', tags: ['css'], ratings: MATURE },
          { front: 'position: sticky', back: 'Элемент ведёт себя как relative, пока не пересечёт заданный порог — тогда становится fixed. Нужна высота у родителя.', tags: ['css'], ratings: LEARNING },
          { front: 'CSS custom properties (vars)', back: '`--color: red; color: var(--color)`. Наследуются, можно менять в runtime через style.setProperty.', tags: ['css'], ratings: STUDIED },
          { front: 'z-index gotcha', back: 'z-index работает только на positioned (не static) элементах. Stacking context изолирует иерархию — высокий z-index внутри не вылезет наружу родителя.', tags: ['css'], ratings: ROUGH },
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
        cards: [
          { front: 'Big O notation', back: 'Верхняя оценка асимптотики — сколько операций в худшем случае при росте входа. Игнорирует константы.', tags: ['algo'], ratings: MATURE },
          { front: 'O(log n)', back: 'Логарифмическая. На каждом шаге отсекаем половину: binary search, balanced BST, heap.', tags: ['algo'], ratings: MATURE },
          { front: 'O(n log n)', back: 'Эффективная сортировка сравнением (merge/quick/heap), построение индекса.', tags: ['algo'], ratings: STUDIED },
          { front: 'O(n²)', back: 'Парные сравнения: bubble sort, вложенные циклы, naive longest-common-subsequence.', tags: ['algo'], ratings: STUDIED },
          { front: 'Binary search', back: 'На отсортированном массиве — O(log n). Инвариант: искомое всегда в [lo, hi].', tags: ['algo'], ratings: MATURE },
          { front: 'Two pointers', back: 'Два индекса двигаются по массиву навстречу / в одну сторону. Решает задачи «пара с суммой X», «без повторений», «палиндром».', tags: ['algo'], ratings: STUDIED },
          { front: 'Sliding window', back: 'Окно фиксированной/переменной ширины сдвигается по массиву. O(n) вместо O(n·k). Пример: max sum of k.', tags: ['algo'], ratings: STUDIED },
          { front: 'DFS', back: 'Depth-first — идём вглубь, потом назад. Стек (рекурсия). Для графов / дерева / лабиринта.', tags: ['algo', 'graph'], ratings: STUDIED },
          { front: 'BFS', back: 'Breadth-first — уровень за уровнем, очередь. Даёт кратчайший путь в невзвешенном графе.', tags: ['algo', 'graph'], ratings: STUDIED },
          { front: 'Dijkstra', back: 'Кратчайшие пути от источника во взвешенном графе с неотрицательными рёбрами. Priority queue, O((V+E) log V).', tags: ['algo', 'graph'], ratings: LEARNING },
          { front: 'Dynamic Programming', back: 'Оптимальная подструктура + перекрытие подзадач → мемоизация или tabulation. Примеры: LIS, knapsack, edit distance.', tags: ['algo'], ratings: LEARNING },
          { front: 'Greedy', back: 'Локально-оптимальный выбор на каждом шаге. Работает когда задача имеет matroid-структуру (interval scheduling, Huffman).', tags: ['algo'], ratings: LEARNING },
          { front: 'Quicksort', back: 'Divide-and-conquer: pivot + partition. Average O(n log n), worst O(n²). In-place, unstable.', tags: ['algo'], ratings: ROUGH },
          { front: 'Mergesort', back: 'Divide-and-conquer с merge. O(n log n) всегда, O(n) extra space, stable.', tags: ['algo'], ratings: STUDIED },
        ],
      },
      {
        name: 'Структуры данных',
        color: 'sky',
        cards: [
          { front: 'Array', back: 'Contiguous block. Random access O(1), insert в середину O(n). Memory-friendly (cache).', tags: ['ds'], ratings: MATURE },
          { front: 'Linked list', back: 'Узлы + указатели. Insert/remove O(1) при известном узле, random access O(n). Плохая cache-локальность.', tags: ['ds'], ratings: STUDIED },
          { front: 'Stack (LIFO)', back: 'Push/Pop с одного конца — O(1). Применения: undo, call stack, DFS, expression evaluation.', tags: ['ds'], ratings: MATURE },
          { front: 'Queue (FIFO)', back: 'Enqueue в хвост, Dequeue из головы — O(1). BFS, task scheduling, rate limiting.', tags: ['ds'], ratings: MATURE },
          { front: 'HashMap', back: 'Hash → bucket. Avg O(1) get/set/remove, worst O(n) при collisions. Нужен хороший hash + resize.', tags: ['ds'], ratings: STUDIED },
          { front: 'HashSet', back: 'HashMap без значения. O(1) contains/add/remove в среднем.', tags: ['ds'], ratings: STUDIED },
          { front: 'BST (binary search tree)', back: 'left < node < right. O(log n) когда сбалансировано (AVL / Red-Black), O(n) в вырожденном случае.', tags: ['ds'], ratings: LEARNING },
          { front: 'Heap / Priority Queue', back: 'Complete binary tree с heap-invariant. Вставка / удаление корня O(log n). Для top-k, Dijkstra.', tags: ['ds'], ratings: LEARNING },
          { front: 'Trie (prefix tree)', back: 'Дерево символов слова. Поиск префикса O(len), autocomplete, IP routing.', tags: ['ds'], ratings: NEW },
          { front: 'Bloom filter', back: 'Probabilistic set. False positives да, false negatives нет. Крошечное место, O(k) операций.', tags: ['ds'], ratings: NEW },
        ],
      },
      {
        name: 'Базы данных',
        color: 'sky',
        cards: [
          { front: 'B-tree index', back: 'Основной индекс РСУБД. Сбалансированное дерево, поиск O(log n). Хорош для range scan (BETWEEN, ORDER BY).', tags: ['db'], ratings: STUDIED },
          { front: 'Hash index', back: 'Точный поиск по ключу O(1). Не помогает для range / ORDER BY. В Postgres поддерживается, но B-tree почти всегда лучше.', tags: ['db'], ratings: LEARNING },
          { front: 'Covering index', back: 'Индекс содержит все поля нужного запроса — СУБД не идёт в heap. INCLUDE в Postgres / included columns в SQL Server.', tags: ['db', 'perf'], ratings: LEARNING },
          { front: 'Нормализация (1NF, 2NF, 3NF)', back: '1NF — атомарные значения. 2NF — зависимость от всего ключа. 3NF — никаких транзитивных зависимостей через не-ключ.', tags: ['db'], ratings: STUDIED },
          { front: 'Когда денормализовать', back: 'Когда чтения доминируют и JOIN-ы — горлышко. Или при доменной агрегации (event-store read-model).', tags: ['db'], ratings: LEARNING },
          { front: 'ACID', back: 'Atomicity, Consistency, Isolation, Durability. Классические гарантии РСУБД-транзакции.', tags: ['db'], ratings: MATURE },
          { front: 'Isolation levels', back: 'Read Uncommitted → Read Committed → Repeatable Read → Serializable. Выше уровень — меньше аномалий, больше блокировок.', tags: ['db'], ratings: ROUGH },
          { front: 'JOIN типы', back: 'INNER — пересечение. LEFT — все из левой + совпадения справа. FULL — всё. CROSS — декартово.', tags: ['db', 'sql'], ratings: MATURE },
          { front: 'Window functions', back: 'SUM/RANK/ROW_NUMBER OVER (PARTITION BY ... ORDER BY ...). Агрегация без сворачивания строк. Running totals, top-N per group.', tags: ['db', 'sql'], ratings: LEARNING },
          { front: 'EXPLAIN / query plan', back: 'Показывает как СУБД собирается выполнять запрос. Seq Scan vs Index Scan, стоимость, rows estimate. Медленный запрос → EXPLAIN ANALYZE.', tags: ['db', 'perf'], ratings: STUDIED },
          { front: 'N+1 query problem', back: 'Итерация по коллекции → отдельный запрос на каждый элемент. Решается через eager loading (Include) / JOIN / батчами.', tags: ['db', 'ef'], ratings: STUDIED },
          { front: 'Deadlock', back: 'Две транзакции держат ресурсы и ждут друг друга. СУБД детектит и kill одну. Решения: единый порядок захвата, меньшие транзакции, retry.', tags: ['db'], ratings: LEARNING },
        ],
      },
      {
        name: 'System Design',
        color: 'neutral',
        cards: [
          { front: 'Load balancer', back: 'Распределяет трафик между инстансами. Round-robin / least-connections / IP hash. L4 (TCP) vs L7 (HTTP).', tags: ['sysdesign'], ratings: STUDIED },
          { front: 'Cache (Redis / Memcached)', back: 'In-memory KV. TTL, LRU eviction. Паттерны: cache-aside, write-through, write-behind. Инвалидация — самая сложная проблема.', tags: ['sysdesign'], ratings: STUDIED },
          { front: 'Message queue', back: 'Async communication через брокер (RabbitMQ, Kafka, SQS). Decoupling, back-pressure, retry. At-least-once vs exactly-once доставка.', tags: ['sysdesign'], ratings: LEARNING },
          { front: 'CDN', back: 'Content Delivery Network — статика ближе к пользователю. Edge caching, SSL termination, DDoS shield.', tags: ['sysdesign'], ratings: STUDIED },
          { front: 'Microservices vs Monolith', back: 'Моно — проще до ~5 команд. Микро — independent deploy, другой стек на команду, но network call = новый failure mode.', tags: ['sysdesign'], ratings: ROUGH },
          { front: 'REST vs gRPC vs GraphQL', back: 'REST — universal, human-debuggable. gRPC — бинарный, HTTP/2, strict contract (proto). GraphQL — клиент описывает форму ответа.', tags: ['sysdesign'], ratings: LEARNING },
          { front: 'CAP-теорема', back: 'Consistency / Availability / Partition tolerance — выбери 2. Распределённые системы всегда жертвуют C или A при partition.', tags: ['sysdesign'], ratings: STUDIED },
          { front: 'Circuit breaker', back: 'Wrapper вокруг ненадёжного downstream. Open после N fail → быстро возвращает ошибку вместо hang. Half-open для probe.', tags: ['sysdesign'], ratings: LEARNING },
          { front: 'Rate limiting', back: 'Token bucket / leaky bucket / sliding window. Защита от abuse и от самих себя (не положить downstream).', tags: ['sysdesign'], ratings: STUDIED },
          { front: 'Idempotency key', back: 'Клиент шлёт UUID в заголовке. Сервер хранит результат ответа — повтор того же ключа возвращает старый ответ. Safe retry.', tags: ['sysdesign'], ratings: NEW },
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
        cards: [
          { front: 'deployment', back: 'деплой, развёртывание — «we\'re rolling out a deployment tonight»', tags: ['it'], ratings: MATURE },
          { front: 'rollback', back: 'откат изменений — «let\'s roll back to the previous release»', tags: ['it'], ratings: STUDIED },
          { front: 'code review', back: 'код-ревью — «can you give this a quick code review?»', tags: ['it'], ratings: MATURE },
          { front: 'pull request (PR)', back: 'пул-реквест — «I opened a PR for the auth refactor»', tags: ['it'], ratings: MATURE },
          { front: 'merge conflict', back: 'конфликт слияния — «I\'ve got a nasty merge conflict in the store.ts»', tags: ['it'], ratings: STUDIED },
          { front: 'technical debt', back: 'технический долг — «we\'re piling up tech debt in the reporting module»', tags: ['it'], ratings: STUDIED },
          { front: 'refactor', back: 'рефакторить — «I\'d like to refactor this before we add features»', tags: ['it'], ratings: MATURE },
          { front: 'scalable', back: 'масштабируемый — «this design won\'t scale beyond 10k users»', tags: ['it'], ratings: STUDIED },
          { front: 'throughput', back: 'пропускная способность (операций в секунду) — «our write throughput dropped by 40%»', tags: ['it'], ratings: LEARNING },
          { front: 'latency', back: 'задержка (time per request) — «p95 latency is up to 800ms»', tags: ['it'], ratings: LEARNING },
          { front: 'downtime', back: 'время простоя — «we\'re aiming for zero downtime deployments»', tags: ['it'], ratings: STUDIED },
          { front: 'regression', back: 'регрессия (сломалось то, что работало) — «this change introduced a regression in checkout»', tags: ['it'], ratings: LEARNING },
          { front: 'race condition', back: 'состояние гонки — «we\'re hitting a race condition between cache and DB writes»', tags: ['it'], ratings: ROUGH },
          { front: 'edge case', back: 'крайний случай — «did you cover the empty-array edge case?»', tags: ['it'], ratings: STUDIED },
          { front: 'bandwidth (metaphor)', back: 'время / ресурс — «I don\'t have the bandwidth for that this sprint»', tags: ['it', 'idiom'], ratings: LEARNING },
        ],
      },
      {
        name: 'Meeting phrases',
        color: 'amber',
        cards: [
          { front: 'Let me follow up on that', back: 'Уточню и вернусь с ответом — когда не знаешь ответ сразу.', tags: ['meeting'], ratings: STUDIED },
          { front: 'Could you elaborate?', back: 'Можете раскрыть мысль? — вежливый способ попросить подробностей.', tags: ['meeting'], ratings: STUDIED },
          { front: "That's a fair point", back: 'Справедливое замечание — признаёшь валидность возражения.', tags: ['meeting'], ratings: LEARNING },
          { front: "I'd push back on that", back: 'Я бы возразил — мягкое «не согласен», без конфликта.', tags: ['meeting'], ratings: LEARNING },
          { front: "Let's circle back", back: 'Вернёмся к этому позже — отложить обсуждение.', tags: ['meeting', 'idiom'], ratings: STUDIED },
          { front: "Let's take this offline", back: 'Обсудим это отдельно — когда тема не релевантна общему митингу.', tags: ['meeting', 'idiom'], ratings: LEARNING },
          { front: "I'm on the fence about it", back: 'Я ещё не определился — нейтральная позиция.', tags: ['meeting', 'idiom'], ratings: NEW },
          { front: 'Could you walk me through it?', back: 'Пройдитесь по шагам, пожалуйста — когда нужно подробное объяснение.', tags: ['meeting'], ratings: STUDIED },
          { front: "Let's align on the goals", back: 'Давайте сверим цели — prep-фраза для стратегических обсуждений.', tags: ['meeting'], ratings: ROUGH },
          { front: "That's out of scope", back: 'Это вне рамок задачи — вежливый отказ расширять объём.', tags: ['meeting'], ratings: LEARNING },
        ],
      },
      {
        name: 'Everyday business',
        color: 'amber',
        cards: [
          { front: "I'm swamped", back: 'Я завален работой — «sorry, I\'m swamped today, can we reschedule?»', tags: ['idiom'], ratings: STUDIED },
          { front: 'On the same page', back: 'Мы понимаем друг друга одинаково — «just making sure we\'re on the same page»', tags: ['idiom'], ratings: MATURE },
          { front: 'Touch base', back: 'Связаться, сверить статус — «let\'s touch base on Friday»', tags: ['idiom'], ratings: STUDIED },
          { front: 'Out of the loop', back: 'Не в курсе — «I\'ve been out of the loop on this project»', tags: ['idiom'], ratings: LEARNING },
          { front: 'Ballpark estimate', back: 'Приблизительная оценка — «can you give me a ballpark estimate?»', tags: ['idiom'], ratings: LEARNING },
          { front: 'Low-hanging fruit', back: 'Лёгкие быстрые победы — «let\'s knock out the low-hanging fruit first»', tags: ['idiom'], ratings: STUDIED },
          { front: 'Move the needle', back: 'Дать заметный эффект — «this change actually moves the needle»', tags: ['idiom'], ratings: NEW },
          { front: 'Back to the drawing board', back: 'Начинаем сначала — когда план провалился.', tags: ['idiom'], ratings: NEW },
          { front: "I'll loop you in", back: 'Я добавлю тебя в переписку — «I\'ll loop you in on the next email»', tags: ['idiom'], ratings: LEARNING },
          { front: 'Bite the bullet', back: 'Стиснуть зубы и сделать неприятное — «we\'ll just have to bite the bullet and rewrite it»', tags: ['idiom'], ratings: NEW },
        ],
      },
    ],
  },
];
