CREATE TABLE authors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  title TEXT NOT NULL,
  isbn TEXT UNIQUE,
  published_year INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO authors (name, email) VALUES
  ('Ada Lovelace', 'ada@example.com'),
  ('Grace Hopper', 'grace@example.com');

INSERT INTO books (author_id, title, isbn, published_year, metadata) VALUES
  (1, 'Analytical Engines', '9780000000011', 1843, '{"genre":"science"}'),
  (2, 'Compiler Notes', '9780000000028', 1952, null);

INSERT INTO reviews (book_id, reviewer_name, rating, body) VALUES
  (1, 'Charles', 5, 'Foundational'),
  (2, 'Navy Reader', 4, 'Practical');
