create table high_scores (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  player_name text not null,
  score integer not null,
  easy_mode boolean not null
);

-- Enable Row Level Security (RLS)
alter table public.high_scores enable row level security;

-- Create policies for public access (anonymous inserts and selects)
create policy "Allow public inserts" on public.high_scores
  for insert with check (true);

create policy "Allow public select" on public.high_scores
  for select using (true);
