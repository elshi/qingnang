<?php

use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});

Route::get('/cases/facets', 'CaseController@facets');
Route::get('/cases/{id}', 'CaseController@show');
Route::get('/cases', 'CaseController@index');
Route::get('/prescriptions', 'PrescriptionController@index');
Route::get('/prescriptions/{id}', 'PrescriptionController@show');
Route::get('/meridians', 'MeridianController@index');
Route::get('/meridians/{id}', 'MeridianController@show');
Route::get('/acupoints', 'AcupointController@index');
Route::get('/acupoints/{id}', 'AcupointController@show');
Route::get('/books/{id}/chapters/{chapterId}', 'BookController@chapter');
Route::get('/books/{id}', 'BookController@show');
Route::get('/books', 'BookController@index');
