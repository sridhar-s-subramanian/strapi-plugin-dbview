import { Page } from '@strapi/strapi/admin';
import { Routes, Route } from 'react-router-dom';
import { DatabaseBrowser } from './DatabaseBrowser';
import { QueryRunner } from './QueryRunner';

export const App = () => (
  <Routes>
    <Route index element={<DatabaseBrowser />} />
    <Route path="query" element={<QueryRunner />} />
    <Route path="*" element={<Page.Error />} />
  </Routes>
);
