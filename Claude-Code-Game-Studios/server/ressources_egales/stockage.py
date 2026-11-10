"""Accès à la base : SQLite par défaut, PostgreSQL avec une URL `postgresql://`.

Le même SQL sert aux deux bases. Une journée simulée s'écrit dans une seule
transaction : nouvel état, mouvements, événements et mesures.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS mondes (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, cas TEXT, population INTEGER NOT NULL, graine BIGINT NOT NULL,
  jours_max INTEGER NOT NULL, jour INTEGER NOT NULL, version_moteur TEXT NOT NULL,
  scenario TEXT NOT NULL, serie TEXT NOT NULL, etat TEXT NOT NULL, mode_inscription TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS points_reprise (
  monde TEXT NOT NULL, jour INTEGER NOT NULL, etat TEXT NOT NULL, PRIMARY KEY (monde, jour));
CREATE TABLE IF NOT EXISTS evenements (
  monde TEXT NOT NULL, id TEXT NOT NULL, jour INTEGER NOT NULL, lieu TEXT NOT NULL, type TEXT NOT NULL,
  foyer INTEGER, humain INTEGER, humain2 INTEGER, data TEXT NOT NULL, PRIMARY KEY (monde, id));
CREATE INDEX IF NOT EXISTS evenements_lieu ON evenements (monde, lieu, jour);
CREATE INDEX IF NOT EXISTS evenements_foyer ON evenements (monde, foyer);
CREATE INDEX IF NOT EXISTS evenements_humain ON evenements (monde, humain);
CREATE INDEX IF NOT EXISTS evenements_humain2 ON evenements (monde, humain2);
CREATE TABLE IF NOT EXISTS mouvements (
  monde TEXT NOT NULL, jour INTEGER NOT NULL, ressource TEXT NOT NULL, de TEXT NOT NULL, vers TEXT NOT NULL,
  nature TEXT NOT NULL, quantite DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (monde, jour, ressource, de, vers, nature));
CREATE TABLE IF NOT EXISTS mesures (
  monde TEXT NOT NULL, jour INTEGER NOT NULL, lieu TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (monde, jour, lieu));
CREATE TABLE IF NOT EXISTS boite (
  monde TEXT NOT NULL, cle TEXT NOT NULL, type TEXT NOT NULL, jour_effet INTEGER, recu_jour INTEGER NOT NULL,
  statut TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (monde, cle));
CREATE INDEX IF NOT EXISTS boite_effet ON boite (monde, jour_effet, statut);
CREATE TABLE IF NOT EXISTS participants (
  monde TEXT NOT NULL, id TEXT NOT NULL, compte TEXT NOT NULL, pseudo TEXT, statut TEXT NOT NULL,
  code_hash TEXT NOT NULL, cree_jour INTEGER NOT NULL, derniere_visite_jour INTEGER,
  PRIMARY KEY (monde, id), UNIQUE (monde, compte));
CREATE INDEX IF NOT EXISTS participants_code ON participants (code_hash);
CREATE TABLE IF NOT EXISTS rattachements (
  monde TEXT NOT NULL, participant TEXT NOT NULL, humain INTEGER NOT NULL,
  PRIMARY KEY (monde, participant), UNIQUE (monde, humain));
"""


class Base:
    """Connexion à la base, avec le même jeu de requêtes pour SQLite et PostgreSQL."""

    def __init__(self, url: str = "ressources-egales.db") -> None:
        self.url = url
        self.postgres = url.startswith(("postgresql://", "postgres://"))
        if self.postgres:
            import psycopg  # dépendance facultative, requise seulement pour PostgreSQL
            self.cx = psycopg.connect(url)
        else:
            self.cx = sqlite3.connect(url, check_same_thread=False, isolation_level=None)
            self.cx.execute("PRAGMA journal_mode=WAL")
            self.cx.execute("PRAGMA synchronous=NORMAL")
        with self.transaction():
            for requete in SCHEMA.split(";"):
                if requete.strip():
                    self.executer(requete)

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self.postgres else sql

    def executer(self, sql: str, params: tuple = ()):
        """Exécute une requête et retourne le curseur."""
        cur = self.cx.cursor()
        cur.execute(self._sql(sql), params)
        return cur

    def executer_lot(self, sql: str, lignes: list[tuple]) -> None:
        """Exécute une même requête pour chaque ligne."""
        if lignes:
            self.cx.cursor().executemany(self._sql(sql), lignes)

    def lire(self, sql: str, params: tuple = ()) -> list[tuple]:
        """Retourne toutes les lignes d'une requête de lecture."""
        cur = self.executer(sql, params)
        lignes = cur.fetchall()
        if self.postgres:
            self.cx.commit()
        return lignes

    def lire_un(self, sql: str, params: tuple = ()):
        """Retourne la première ligne, ou `None`."""
        lignes = self.lire(sql, params)
        return lignes[0] if lignes else None

    @contextmanager
    def transaction(self):
        """Tout ce qui s'écrit dans le bloc est validé ensemble, ou annulé ensemble."""
        if not self.postgres:
            self.cx.execute("BEGIN IMMEDIATE")
        try:
            yield self
        except BaseException:
            self.cx.rollback()
            raise
        else:
            self.cx.commit()

    def fermer(self) -> None:
        """Ferme la connexion."""
        self.cx.close()
